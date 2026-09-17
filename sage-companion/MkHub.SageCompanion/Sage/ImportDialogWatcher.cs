using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace MkHub.SageCompanion.Sage
{
    public static class ImportDialogWatcher
    {
        const int LB_GETCOUNT = 0x018B;
        const int LB_GETTEXT = 0x0189;
        const int LB_GETTEXTLEN = 0x018A;
        const int LB_SETCURSEL = 0x0186;
        const int BM_CLICK = 0x00F5;
        const int WM_GETTEXT = 0x000D;

        [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
        [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr lp);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
        [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int SendMessage(IntPtr hWnd, int msg, IntPtr wParam, StringBuilder lParam);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
        delegate bool EnumProc(IntPtr hWnd, IntPtr lp);

        public static void Pump(int pid, string itemHint, string customerHint, string sagePassword)
        {
            var seen = new HashSet<string>();
            for (int i = 0; i < 1200; i++)
            {
                try { Handle(pid, itemHint, customerHint, sagePassword, seen); }
                catch (Exception ex) { AppLog.Error("[watcher] " + ex.Message); }
                Thread.Sleep(500);
            }
        }

        static void Handle(int pid, string itemHint, string customerHint, string sagePassword, HashSet<string> seen)
        {
            EnumWindows(delegate(IntPtr hwnd, IntPtr lp)
            {
                uint wpid;
                GetWindowThreadProcessId(hwnd, out wpid);
                if ((int)wpid != pid || !IsWindowVisible(hwnd)) return true;
                var title = TextOf(hwnd);
                var body = CollectText(hwnd);
                string key = title + "|" + Trim(body, 180);
                bool first = seen.Add(key);
                if (first)
                    AppLog.Info("[dialog] " + title + " :: " + Trim(body, 240));

                if (!first) return true;

                if (title.IndexOf("Password", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("Enter Password", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!FillPassword(hwnd, sagePassword)) seen.Remove(key);
                    return true;
                }

                if (body.IndexOf("internal service", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    ClickNamed(hwnd, "No");
                    return true;
                }
                if (title.IndexOf("Select Activity", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("Select Activity", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    var hint = HintFromMatchDialog(body, itemHint);
                    if (!PickList(hwnd, hint)) seen.Remove(key);
                    return true;
                }
                if (title.IndexOf("Select Customer", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("Select Customer", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!PickList(hwnd, customerHint)) seen.Remove(key);
                    return true;
                }
                if (body.IndexOf("successfully", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("import complete", StringComparison.OrdinalIgnoreCase) >= 0
                    || title.IndexOf("Import Complete", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    ClickNamed(hwnd, "OK");
                    ClickNamed(hwnd, "Close");
                    return true;
                }
                if (body.IndexOf("Select Payroll", StringComparison.OrdinalIgnoreCase) >= 0
                    || title.IndexOf("Payroll", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!PickList(hwnd, "Regular") && !PickList(hwnd, "Non-Payroll"))
                        seen.Remove(key);
                    return true;
                }
                return true;
            }, IntPtr.Zero);
        }

        static string HintFromMatchDialog(string body, string fallback)
        {
            const string marker = "to match ";
            int i = (body ?? "").IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (i < 0) return fallback;
            var rest = body.Substring(i + marker.Length).Trim();
            int end = rest.Length;
            for (int k = 0; k < rest.Length; k++)
            {
                char c = rest[k];
                if (c == ':' || c == '|' || c == ' ' || c == '\t')
                {
                    end = k;
                    break;
                }
            }
            var code = rest.Substring(0, end).Trim();
            return code.Length > 0 ? code : fallback;
        }

        static bool PickList(IntPtr parent, string hint)
        {
            IntPtr list = IntPtr.Zero;
            IntPtr selectBtn = IntPtr.Zero;
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                string cls = ClassOf(h);
                int id = GetDlgCtrlID(h);
                if (cls == "ListBox") list = h;
                if (cls == "Button" && (id == 1 || TextOf(h).IndexOf("Select", StringComparison.OrdinalIgnoreCase) >= 0))
                    selectBtn = h;
                return true;
            }, IntPtr.Zero);
            if (list == IntPtr.Zero || selectBtn == IntPtr.Zero) return false;
            int count = SendMessage(list, LB_GETCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
            if (count <= 0) return false;
            int pick = -1;
            for (int i = 0; i < count; i++)
            {
                int len = SendMessage(list, LB_GETTEXTLEN, (IntPtr)i, IntPtr.Zero).ToInt32();
                var buf = new StringBuilder(len + 4);
                SendMessage(list, LB_GETTEXT, (IntPtr)i, buf);
                string row = buf.ToString();
                if (i < 20) AppLog.Info("  list[" + i + "] " + Trim(row, 80));
                if (pick < 0 && row.IndexOf(hint, StringComparison.OrdinalIgnoreCase) >= 0)
                    pick = i;
            }
            if (pick < 0 && count > 0) pick = 0;
            if (pick < 0) return false;
            AppLog.Info("[watcher] picking list index " + pick + " for hint [" + hint + "]");
            SendMessage(list, LB_SETCURSEL, (IntPtr)pick, IntPtr.Zero);
            SetForegroundWindow(parent);
            SendMessage(selectBtn, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            return true;
        }

        static bool FillPassword(IntPtr parent, string password)
        {
            if (string.IsNullOrEmpty(password))
            {
                AppLog.Error("[watcher] password dialog but no password provided");
                return true;
            }
            const int GWL_STYLE = -16;
            const int ES_PASSWORD = 0x0020;
            const int WM_SETTEXT = 0x000C;
            IntPtr pwdEdit = IntPtr.Zero;
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                if (ClassOf(h) == "Edit")
                {
                    int style = GetWindowLong(h, GWL_STYLE);
                    if ((style & ES_PASSWORD) != 0) pwdEdit = h;
                }
                return true;
            }, IntPtr.Zero);
            if (pwdEdit == IntPtr.Zero)
            {
                AppLog.Info("[watcher] password edit not found yet");
                return false;
            }
            AppLog.Info("[watcher] filling Sage import password");
            SetForegroundWindow(parent);
            SendMessage(pwdEdit, WM_SETTEXT, IntPtr.Zero, password);
            ClickNamed(parent, "OK");
            return true;
        }

        static void ClickNamed(IntPtr parent, string name)
        {
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                if (ClassOf(h) == "Button" && string.Equals(TextOf(h).Replace("&", ""), name, StringComparison.OrdinalIgnoreCase))
                {
                    AppLog.Info("[watcher] click " + name);
                    SetForegroundWindow(parent);
                    SendMessage(h, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
        }

        static string CollectText(IntPtr parent)
        {
            var sb = new StringBuilder();
            sb.Append(TextOf(parent));
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                string t = TextOf(h);
                if (t.Length > 0) { sb.Append(" | "); sb.Append(t); }
                return true;
            }, IntPtr.Zero);
            return sb.ToString();
        }

        static string TextOf(IntPtr h)
        {
            var sb = new StringBuilder(512);
            GetWindowText(h, sb, sb.Capacity);
            if (sb.Length == 0)
            {
                var buf = new StringBuilder(512);
                SendMessage(h, WM_GETTEXT, (IntPtr)buf.Capacity, buf);
                return buf.ToString();
            }
            return sb.ToString();
        }

        static string ClassOf(IntPtr h)
        {
            var sb = new StringBuilder(256);
            GetClassName(h, sb, sb.Capacity);
            return sb.ToString();
        }

        static string Trim(string s, int n)
        {
            if (s == null) return "";
            s = s.Replace("\r", " ").Replace("\n", " ");
            return s.Length <= n ? s : s.Substring(0, n) + "...";
        }
    }
}
