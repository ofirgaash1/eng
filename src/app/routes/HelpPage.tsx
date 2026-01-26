export default function HelpPage() {
  return (
    <div className="space-y-6 text-right text-sm text-white/80" dir="rtl">
      <section className="space-y-3">
        <p>באתר הזה לומדים אנגלית.</p>
        <p>
          המטרה היא <strong>לשפר אוצר מילים</strong> דרך צפייה בסדרות וסרטים.
        </p>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 1 – הורדת סרט / פרק</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>מורידים סרט בטורנט או בטלגרם</li>
          <li>
            חשוב לוודא מראש שהאודיו <strong>לא</strong> בפורמט Dolby Digital
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>✅ <strong>AAC</strong> זה טוב</li>
            </ul>
          </li>
          <li>
            את הטורנטים מומלץ לחפש כאן:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>
                <a
                  href="http://rargb.to/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-white underline decoration-white/40 underline-offset-4"
                >
                  http://rargb.to/
                </a>
              </li>
              <li>
                <a
                  href="https://1337x.to/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-white underline decoration-white/40 underline-offset-4"
                >
                  https://1337x.to/
                </a>
              </li>
            </ul>
          </li>
          <li>אם אתם חדשים בטורנטים – שווה ללמוד איך משתמשים (זה לא מסובך)</li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 2 – הורדת כתוביות באנגלית</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            חוזרים לאתר ומורידים <strong>כתוביות באנגלית</strong>
          </li>
          <li>
            כתוביות הן קובץ עם סיומת <code className="rounded bg-white/10 px-1">srt</code>
          </li>
          <li>לפעמים הטורנט כבר מגיע עם כתוביות – ואז אתם מסודרים</li>
          <li>
            אם אין:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>
                חפשו ב־
                <a
                  href="https://opensubtitles.org"
                  target="_blank"
                  rel="noreferrer"
                  className="mr-1 text-white underline decoration-white/40 underline-offset-4"
                >
                  opensubtitles.org
                </a>
              </li>
              <li>
                או בלשונית <strong>Find Subs</strong> באתר
                <blockquote className="mt-2 rounded border-l-2 border-white/20 bg-white/5 px-3 py-2 text-xs text-white/60">
                  שימו לב: יש שם כמות מוגבלת של הורדות יומיות – אבל שווה לנסות
                </blockquote>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 3 – כתוביות בעברית (לא חובה)</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>מורידים כתוביות בעברית</li>
          <li>בדיוק באותו אופן כמו בשלב 2</li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 4 – טעינה לנגן</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>טוענים את <strong>קובץ הסרט</strong></li>
          <li>וטוענים את <strong>קובץ הכתוביות</strong></li>
          <li>הכל דרך לשונית <strong>Player</strong></li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 5 – צפייה ולמידת מילים</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>לוחצים ▶️ Play</li>
          <li>
            מסמנים מילים לא מוכרות:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>קליק רגיל – שומר את המילה</li>
              <li>קליק ימני – מחפש את המילה בגוגל</li>
            </ul>
          </li>
          <li>
            לתרגום נוח יותר:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>טוענים מראש כתוביות בעברית כ־<strong>Second Subtitles</strong></li>
              <li>אפשר להסתיר / להציג אותן עם לחיצה על <strong>H</strong></li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 6 – לשונית Words</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            בלשונית <strong>Words</strong> אפשר:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>לראות את כל המילים ששמרתם</li>
              <li>למיין לפי תדירות שימוש באנגלית או קריטריונים אחרים</li>
              <li>למחוק מילים שכבר למדתם או שנשמרו בטעות</li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 7 – לימוד עם ChatGPT</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            באותו עמוד יש כפתורים שמאפשרים:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>להעתיק את כל רשימת המילים בבת אחת</li>
              <li>להגיע לשיחה מוכנה ב־ChatGPT</li>
            </ul>
          </li>
          <li>כל מה שנשאר לכם לעשות זה להדביק את המילים</li>
          <li>אגב: <strong>לא צריך חשבון ב־ChatGPT</strong> בשביל זה</li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 8 – רענון הזיכרון</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            בלשונית <strong>Quotes (ציטוטים)</strong>:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>לוחצים על מילה</li>
              <li>רואים את כל ההקשרים שבהם היא הופיעה</li>
              <li>מכל קובצי הכתוביות שטענתם לאתר אי פעם</li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">שלב 9 – שימוש חכם בפיצ'רים</h2>
        <p>יש באתר המון פיצ'רים שעוזרים ללמוד בצורה יעילה יותר.</p>
        <h3 className="text-base font-semibold text-white">המלצות שימוש</h3>
        <ul className="list-disc space-y-2 pr-5">
          <li>להסתיר תמיד את הכתוביות בעברית (<strong>H</strong>)</li>
          <li>להציג אותן רק כשצריך להבין משפט</li>
          <li>ואז להסתיר שוב (<strong>H</strong>)</li>
          <li>
            לחלופין:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>
                ב־<strong>Settings</strong> אפשר להגדיר גודל פצפון לכתוביות השניות (כדי
                להתפתות פחות לקרוא בעברית)
              </li>
            </ul>
          </li>
        </ul>
        <h3 className="text-base font-semibold text-white">קיצורי מקלדת שימושיים</h3>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            <strong>F</strong> – מסך מלא
          </li>
          <li>חיצים – קפיצה 5 שניות אחורה / קדימה</li>
          <li>
            <strong>רווח</strong> – עצירה / ניגון
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">הגדרות מתקדמות (Settings)</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>קביעת גודל טקסט</li>
          <li>
            בחירת צבעים לסימון מילים:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>
                מילה שסימנתם (למשל <code className="rounded bg-white/10 px-1">actor</code>) תופיע:
              </li>
              <li>🟢 בירוק – אם נאמרת בדיוק המילה</li>
              <li>
                🟠 בכתום – אם נאמרת הטיה (<code className="rounded bg-white/10 px-1">act</code>,{" "}
                <code className="rounded bg-white/10 px-1">acting</code>,{" "}
                <code className="rounded bg-white/10 px-1">actress</code> וכו’)
              </li>
            </ul>
          </li>
          <li>
            סנכרון כתוביות:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>אם הכתוביות מוקדמות / מאוחרות</li>
              <li>משתמשים בכפתור <strong>Offset</strong></li>
              <li>יש Offset נפרד לכתוביות הראשיות ולמשניות</li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">טיפים חשובים ללשונית Words</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            מיון לפי <strong>תדירות שימוש באנגלית</strong>:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>עוזר להבין אילו מילים קריטיות</li>
              <li>ואילו הן יותר <em>nice to have</em></li>
            </ul>
          </li>
          <li>
            העתקת מילים <strong>עם המשפט שלהן</strong>:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>מונעת הסברים לא רלוונטיים</li>
              <li>
                למשל:
                <ul className="mt-2 list-disc space-y-1 pr-5">
                  <li>
                    <code className="rounded bg-white/10 px-1">wind</code> = רוח ❌
                  </li>
                  <li>
                    <code className="rounded bg-white/10 px-1">to wind up</code> = לסיים ✅
                  </li>
                  <li>
                    <code className="rounded bg-white/10 px-1">corporate</code> כשם עצם ❌
                  </li>
                  <li>
                    <code className="rounded bg-white/10 px-1">corporate</code> כשם תואר בהקשר שאתם ראיתם ✅
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">מעבר למחשב אחר</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>
            רוצים לשמור התקדמות?
            <ol className="mt-2 list-decimal space-y-1 pr-5">
              <li>בלשונית <strong>Words</strong> – לוחצים <strong>Export JSON</strong></li>
              <li>במחשב החדש – עושים <strong>Import</strong></li>
            </ol>
          </li>
          <li>
            רוצים להעביר גם כתוביות?
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>בלשונית <strong>Quotes</strong> אפשר להוריד את כל קובצי הכתוביות</li>
              <li>ולטען אותם מחדש במחשב החדש</li>
            </ul>
          </li>
        </ul>
      </section>

      <hr className="border-white/10" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">הערה לגבי Find Subtitles</h2>
        <ul className="list-disc space-y-2 pr-5">
          <li>יש שם כמה מפתחות API</li>
          <li>בפועל זה מוגבל לכ־<strong>5 הורדות ביום</strong> לכל מפתח</li>
          <li>אם זה לא עובד – זה נורמלי</li>
          <li>
            מניסיון:
            <ul className="mt-2 list-disc space-y-1 pr-5">
              <li>חיפוש לפי <strong>שם קובץ</strong> עובד טוב</li>
              <li>חיפוש לפי <strong>Hash</strong> פחות</li>
            </ul>
          </li>
        </ul>
      </section>
    </div>
  );
}
