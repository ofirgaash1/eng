From your log, two things are already clear.

The ghost is not ordinary key repeat. A held key would usually produce multiple `KeyDown` events and then one `KeyUp`. Your ghost shows a fresh `KeyDown` + `KeyUp` pair. And it is `Hardware (Native)`, so Windows did not classify it as normal `SendInput`-style injection. That pushes suspicion below the app layer: keyboard firmware, wireless receiver/Bluetooth retransmit, flaky controller/switch, or a lower HID/filter driver. Chrome is just where the key landed.

To narrow it further, I added [keyboard-rawinput-listener.ps1](c:/Users/owner/Documents/USER/eng/keyboard-rawinput-listener.ps1). Run it in a second window:

```powershell
powershell -ExecutionPolicy Bypass -File .\keyboard-rawinput-listener.ps1
```

Then compare both listeners when a ghost happens:
- [keyboard-source-listener.ps1](c:/Users/owner/Documents/USER/eng/keyboard-source-listener.ps1) says whether Windows marked it injected.
- [keyboard-rawinput-listener.ps1](c:/Users/owner/Documents/USER/eng/keyboard-rawinput-listener.ps1) says whether the event had a real device handle/path.

Interpret it like this:
- `Origin=SoftwareInjected` in the hook listener: user-mode automation/macro/injection.
- `Origin=Hardware (Native)` and raw-input `Source=DeviceHandlePresent`: strong evidence it came from a keyboard/dongle/HID path.
- `Origin=Hardware (Native)` and raw-input `Source=NoDeviceHandle`: ambiguous, but still not pointing at Chrome; that suggests a more unusual virtual/driver path.

One nuance: on this machine, even synthetic `SendKeys` showed up in raw input, but with `Source=NoDeviceHandle` and `Device=unknown`. So the device-handle field matters more than raw-input presence by itself.

If you want actual proof, not just strong evidence:
1. Run both scripts and capture one ghost event with matching timestamps.
2. If it shows `Hardware (Native)` plus `Source=DeviceHandlePresent`, test a different keyboard or a different connection path.
3. If wireless, try wired, a different USB port, and no hub.
4. Disable keyboard vendor software/macros.
5. For near-forensic proof, capture USB HID traffic with USBPcap/Wireshark. If the duplicate report is on the bus, the source is the keyboard/dongle/firmware path. If it is not, the source is above the bus in Windows or a driver.

If you want, I can also merge both listeners into one script and add automatic “same-key replay” detection so ghost events stand out immediately.



param(
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

$source = @"
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

public class RawKeyboardWindow : NativeWindow, IDisposable
{
    private const int WM_INPUT = 0x00FF;
    private const int RIM_TYPEKEYBOARD = 1;
    private const int RID_INPUT = 0x10000003;
    private const int RIDI_DEVICENAME = 0x20000007;
    private const uint RIDEV_INPUTSINK = 0x00000100;
    private const uint RIDEV_DEVNOTIFY = 0x00002000;

    private static readonly ConcurrentQueue<RawKeyboardEventInfo> _queue = new ConcurrentQueue<RawKeyboardEventInfo>();

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWKEYBOARD
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RAWINPUT
    {
        public RAWINPUTHEADER header;
        public RAWKEYBOARD keyboard;
    }

    public class RawKeyboardEventInfo
    {
        public string Timestamp { get; set; }
        public ushort VKey { get; set; }
        public ushort MakeCode { get; set; }
        public ushort Flags { get; set; }
        public uint Message { get; set; }
        public uint ExtraInformation { get; set; }
        public string DevicePath { get; set; }
        public string ActiveWindowTitle { get; set; }
        public int? ActiveProcessPid { get; set; }
        public string ActiveProcessName { get; set; }
        public string ActiveProcessPath { get; set; }
    }

    public RawKeyboardWindow()
    {
        CreateHandle(new CreateParams());
        RegisterForRawKeyboard();
    }

    public static bool TryDequeue(out RawKeyboardEventInfo info)
    {
        return _queue.TryDequeue(out info);
    }

    public void Dispose()
    {
        DestroyHandle();
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_INPUT)
        {
            ProcessRawInput(m.LParam);
        }

        base.WndProc(ref m);
    }

    private void RegisterForRawKeyboard()
    {
        RAWINPUTDEVICE[] devices = new RAWINPUTDEVICE[1];
        devices[0].usUsagePage = 0x01;
        devices[0].usUsage = 0x06;
        devices[0].dwFlags = RIDEV_INPUTSINK | RIDEV_DEVNOTIFY;
        devices[0].hwndTarget = this.Handle;

        if (!RegisterRawInputDevices(devices, (uint)devices.Length, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    private static void ProcessRawInput(IntPtr rawInputHandle)
    {
        uint size = 0;
        uint headerSize = (uint)Marshal.SizeOf(typeof(RAWINPUTHEADER));

        uint result = GetRawInputData(rawInputHandle, RID_INPUT, IntPtr.Zero, ref size, headerSize);
        if (result != 0 || size == 0)
        {
            return;
        }

        IntPtr buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            result = GetRawInputData(rawInputHandle, RID_INPUT, buffer, ref size, headerSize);
            if (result == 0xFFFFFFFF)
            {
                return;
            }

            RAWINPUT raw = (RAWINPUT)Marshal.PtrToStructure(buffer, typeof(RAWINPUT));
            if (raw.header.dwType != RIM_TYPEKEYBOARD)
            {
                return;
            }

            string devicePath = GetDevicePath(raw.header.hDevice);

            string windowTitle = null;
            int? pid = null;
            string processName = null;
            string processPath = null;

            IntPtr hwnd = GetForegroundWindow();
            if (hwnd != IntPtr.Zero)
            {
                StringBuilder titleBuffer = new StringBuilder(1024);
                GetWindowText(hwnd, titleBuffer, titleBuffer.Capacity);
                windowTitle = titleBuffer.ToString();

                uint rawPid;
                GetWindowThreadProcessId(hwnd, out rawPid);
                if (rawPid != 0)
                {
                    pid = (int)rawPid;
                    try
                    {
                        using (Process process = Process.GetProcessById((int)rawPid))
                        {
                            processName = process.ProcessName;
                            try
                            {
                                processPath = process.MainModule.FileName;
                            }
                            catch
                            {
                                processPath = null;
                            }
                        }
                    }
                    catch
                    {
                        processName = null;
                        processPath = null;
                    }
                }
            }

            _queue.Enqueue(new RawKeyboardEventInfo
            {
                Timestamp = DateTimeOffset.Now.ToString("o"),
                VKey = raw.keyboard.VKey,
                MakeCode = raw.keyboard.MakeCode,
                Flags = raw.keyboard.Flags,
                Message = raw.keyboard.Message,
                ExtraInformation = raw.keyboard.ExtraInformation,
                DevicePath = devicePath,
                ActiveWindowTitle = windowTitle,
                ActiveProcessPid = pid,
                ActiveProcessName = processName,
                ActiveProcessPath = processPath
            });
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string GetDevicePath(IntPtr deviceHandle)
    {
        if (deviceHandle == IntPtr.Zero)
        {
            return null;
        }

        uint size = 0;
        uint result = GetRawInputDeviceInfo(deviceHandle, RIDI_DEVICENAME, IntPtr.Zero, ref size);
        if (result == 0xFFFFFFFF || size == 0)
        {
            return null;
        }

        StringBuilder deviceName = new StringBuilder((int)size);
        result = GetRawInputDeviceInfo(deviceHandle, RIDI_DEVICENAME, deviceName, ref size);
        if (result == 0xFFFFFFFF)
        {
            return null;
        }

        return deviceName.ToString();
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterRawInputDevices(
        RAWINPUTDEVICE[] pRawInputDevices,
        uint uiNumDevices,
        uint cbSize);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputData(
        IntPtr hRawInput,
        uint uiCommand,
        IntPtr pData,
        ref uint pcbSize,
        uint cbSizeHeader);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputDeviceInfo(
        IntPtr hDevice,
        uint uiCommand,
        IntPtr pData,
        ref uint pcbSize);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern uint GetRawInputDeviceInfo(
        IntPtr hDevice,
        uint uiCommand,
        StringBuilder pData,
        ref uint pcbSize);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

Add-Type -ReferencedAssemblies @("System.Windows.Forms.dll") -TypeDefinition $source -Language CSharp

function Get-KeyMessageName {
    param([uint32]$Message)

    switch ($Message) {
        0x0100 { "KeyDown" }
        0x0101 { "KeyUp" }
        0x0104 { "SysKeyDown" }
        0x0105 { "SysKeyUp" }
        default { "0x{0:X4}" -f $Message }
    }
}

function Get-KeyName {
    param([uint32]$VirtualKey)

    try {
        return ([System.Windows.Forms.Keys]$VirtualKey).ToString()
    }
    catch {
        return "VK_$("{0:X2}" -f $VirtualKey)"
    }
}

function Get-DeviceShortName {
    param([string]$DevicePath)

    if (-not $DevicePath) {
        return $null
    }

    if ($DevicePath -match 'VID_([0-9A-F]{4}).*PID_([0-9A-F]{4})') {
        return "VID_$($matches[1]) PID_$($matches[2])"
    }

    return $DevicePath
}

function Convert-RawInputRecord {
    param(
        [Parameter(Mandatory = $true)]
        [RawKeyboardWindow+RawKeyboardEventInfo]$EventInfo
    )

    [pscustomobject]@{
        Timestamp = $EventInfo.Timestamp
        EventType = Get-KeyMessageName -Message $EventInfo.Message
        Key = Get-KeyName -VirtualKey $EventInfo.VKey
        VirtualKey = $EventInfo.VKey
        MakeCode = $EventInfo.MakeCode
        Flags = ('0x{0:X4}' -f $EventInfo.Flags)
        ExtraInfo = ('0x{0:X8}' -f $EventInfo.ExtraInformation)
        DevicePath = $EventInfo.DevicePath
        DeviceShort = Get-DeviceShortName -DevicePath $EventInfo.DevicePath
        SourceHint = if ($EventInfo.DevicePath) { "DeviceHandlePresent" } else { "NoDeviceHandle" }
        ActiveWindowTitle = $EventInfo.ActiveWindowTitle
        ActiveProcessPID = $EventInfo.ActiveProcessPid
        ActiveProcessName = $EventInfo.ActiveProcessName
        ActiveProcessPath = $EventInfo.ActiveProcessPath
    }
}

$script:stopRequested = $false
$script:cancelHandler = [System.ConsoleCancelEventHandler]{
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    $script:stopRequested = $true
}

[Console]::add_CancelKeyPress($script:cancelHandler)
$window = New-Object RawKeyboardWindow

Write-Host "Listening for Raw Input keyboard events. Press Ctrl+C to stop."
Write-Host "Compare this with the low-level hook listener."
Write-Host "Events with a real device handle/path are stronger evidence they came through a keyboard/HID path."

try {
    while (-not $script:stopRequested) {
        [System.Windows.Forms.Application]::DoEvents()

        $eventInfo = $null
        while ([RawKeyboardWindow]::TryDequeue([ref]$eventInfo)) {
            $record = Convert-RawInputRecord -EventInfo $eventInfo

            if ($Json) {
                [Console]::WriteLine(($record | ConvertTo-Json -Compress))
            }
            else {
                $procDisplay = if ($record.ActiveProcessPID) {
                    "{0} ({1})" -f $record.ActiveProcessName, $record.ActiveProcessPID
                }
                else {
                    "unknown"
                }

                [Console]::WriteLine(("{0} | {1} | Key={2} VK={3} Make={4} Flags={5} | Source={6} | Device={7} | ActiveProcess={8} | Window={9}" -f `
                        $record.Timestamp,
                        $record.EventType,
                        $record.Key,
                        $record.VirtualKey,
                        $record.MakeCode,
                        $record.Flags,
                        $record.SourceHint,
                        $(if ($record.DeviceShort) { $record.DeviceShort } else { "unknown" }),
                        $procDisplay,
                        $record.ActiveWindowTitle))
            }
        }

        Start-Sleep -Milliseconds 10
    }
}
finally {
    $window.Dispose()
    [Console]::remove_CancelKeyPress($script:cancelHandler)
}
