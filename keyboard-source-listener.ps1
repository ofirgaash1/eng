param(
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$source = @"
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class KeyboardHookHost
{
    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x0100;
    public const int WM_KEYUP = 0x0101;
    public const int WM_SYSKEYDOWN = 0x0104;
    public const int WM_SYSKEYUP = 0x0105;
    public const int LLKHF_INJECTED = 0x00000010;
    public const int LLKHF_LOWER_IL_INJECTED = 0x00000002;
    public const uint PM_REMOVE = 0x0001;

    public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    private static readonly LowLevelKeyboardProc _proc = HookCallback;
    private static readonly ConcurrentQueue<KeyboardEventInfo> _queue = new ConcurrentQueue<KeyboardEventInfo>();
    private static IntPtr _hookId = IntPtr.Zero;

    [StructLayout(LayoutKind.Sequential)]
    public struct KBDLLHOOKSTRUCT
    {
        public UInt32 vkCode;
        public UInt32 scanCode;
        public UInt32 flags;
        public UInt32 time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public UIntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
        public uint lPrivate;
    }

    public class KeyboardEventInfo
    {
        public string Timestamp { get; set; }
        public uint VkCode { get; set; }
        public uint ScanCode { get; set; }
        public uint Flags { get; set; }
        public uint Time { get; set; }
        public ulong ExtraInfo { get; set; }
        public int Message { get; set; }
        public bool IsInjected { get; set; }
        public bool IsLowerIntegrityInjected { get; set; }
        public string ActiveWindowTitle { get; set; }
        public int? ActiveProcessPid { get; set; }
        public string ActiveProcessName { get; set; }
        public string ActiveProcessPath { get; set; }
    }

    public static void Install()
    {
        if (_hookId != IntPtr.Zero)
        {
            return;
        }

        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule)
        {
            _hookId = SetWindowsHookEx(
                WH_KEYBOARD_LL,
                _proc,
                GetModuleHandle(curModule.ModuleName),
                0
            );
        }

        if (_hookId == IntPtr.Zero)
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    public static void Uninstall()
    {
        if (_hookId == IntPtr.Zero)
        {
            return;
        }

        if (!UnhookWindowsHookEx(_hookId))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        _hookId = IntPtr.Zero;
    }

    public static bool PumpOnce()
    {
        MSG msg;
        if (!PeekMessage(out msg, IntPtr.Zero, 0, 0, PM_REMOVE))
        {
            return false;
        }

        TranslateMessage(ref msg);
        DispatchMessage(ref msg);
        return true;
    }

    public static bool TryDequeue(out KeyboardEventInfo info)
    {
        return _queue.TryDequeue(out info);
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            KBDLLHOOKSTRUCT data = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            int message = wParam.ToInt32();

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

            _queue.Enqueue(new KeyboardEventInfo
            {
                Timestamp = DateTimeOffset.Now.ToString("o"),
                VkCode = data.vkCode,
                ScanCode = data.scanCode,
                Flags = data.flags,
                Time = data.time,
                ExtraInfo = data.dwExtraInfo.ToUInt64(),
                Message = message,
                IsInjected = (data.flags & LLKHF_INJECTED) == LLKHF_INJECTED,
                IsLowerIntegrityInjected = (data.flags & LLKHF_LOWER_IL_INJECTED) == LLKHF_LOWER_IL_INJECTED,
                ActiveWindowTitle = windowTitle,
                ActiveProcessPid = pid,
                ActiveProcessName = processName,
                ActiveProcessPath = processPath
            });
        }

        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool PeekMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);

    [DllImport("user32.dll")]
    public static extern bool TranslateMessage([In] ref MSG lpMsg);

    [DllImport("user32.dll")]
    public static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@

Add-Type -TypeDefinition $source -Language CSharp

function Get-KeyMessageName {
    param([int]$Message)

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

function Convert-KeyboardEventRecord {
    param(
        [Parameter(Mandatory = $true)]
        [KeyboardHookHost+KeyboardEventInfo]$EventInfo
    )

    $origin = if ($EventInfo.IsInjected) { "SoftwareInjected" } else { "Hardware" }
    $injectionDetail = if ($EventInfo.IsLowerIntegrityInjected) { "LowerIntegrity" } elseif ($EventInfo.IsInjected) { "Injected" } else { "Native" }

    [pscustomobject]@{
        Timestamp = $EventInfo.Timestamp
        EventType = Get-KeyMessageName -Message $EventInfo.Message
        Key = Get-KeyName -VirtualKey $EventInfo.VkCode
        VirtualKey = $EventInfo.VkCode
        ScanCode = $EventInfo.ScanCode
        Origin = $origin
        InjectionDetail = $injectionDetail
        Flags = ('0x{0:X8}' -f $EventInfo.Flags)
        ExtraInfo = ('0x{0:X}' -f $EventInfo.ExtraInfo)
        ActiveWindowTitle = $EventInfo.ActiveWindowTitle
        ActiveProcessPID = $EventInfo.ActiveProcessPid
        ActiveProcessName = $EventInfo.ActiveProcessName
        ActiveProcessPath = $EventInfo.ActiveProcessPath
        Note = if ($EventInfo.IsInjected) {
            "Windows marks this event as injected, but does not expose the injector PID through the low-level keyboard hook API."
        } else {
            $null
        }
    }
}

try {
    Add-Type -AssemblyName System.Windows.Forms
}
catch {
}

$script:stopRequested = $false
$script:cancelHandler = [System.ConsoleCancelEventHandler]{
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    $script:stopRequested = $true
}

[Console]::add_CancelKeyPress($script:cancelHandler)
[KeyboardHookHost]::Install()

Write-Host "Listening for global keyboard events. Press Ctrl+C to stop."
Write-Host "Hardware vs software is based on Windows low-level hook injection flags."
Write-Host "Injector PID is not available from this API; active foreground PID/name are included instead."

try {
    while (-not $script:stopRequested) {
        while ([KeyboardHookHost]::PumpOnce()) {
        }

        $eventInfo = $null
        while ([KeyboardHookHost]::TryDequeue([ref]$eventInfo)) {
            $record = Convert-KeyboardEventRecord -EventInfo $eventInfo

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

                $note = if ($record.Note) { " | Note: $($record.Note)" } else { "" }
                [Console]::WriteLine(("{0} | {1} | Key={2} VK={3} Scan={4} | Origin={5} ({6}) | ActiveProcess={7} | Window={8}{9}" -f `
                        $record.Timestamp,
                        $record.EventType,
                        $record.Key,
                        $record.VirtualKey,
                        $record.ScanCode,
                        $record.Origin,
                        $record.InjectionDetail,
                        $procDisplay,
                        $record.ActiveWindowTitle,
                        $note))
            }
        }

        Start-Sleep -Milliseconds 10
    }
}
finally {
    [Console]::remove_CancelKeyPress($script:cancelHandler)
    [KeyboardHookHost]::Uninstall()
}
