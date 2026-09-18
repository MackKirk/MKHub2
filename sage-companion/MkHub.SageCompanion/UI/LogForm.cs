using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace MkHub.SageCompanion.UI
{
    public class LogForm : Form
    {
        readonly TextBox _box;

        public LogForm()
        {
            Text = "MKHub Sage Companion — Log";
            Width = 720;
            Height = 480;
            StartPosition = FormStartPosition.CenterScreen;

            _box = new TextBox
            {
                Multiline = true,
                ReadOnly = true,
                ScrollBars = ScrollBars.Both,
                Dock = DockStyle.Fill,
                Font = new Font("Consolas", 9f),
                WordWrap = false
            };
            Controls.Add(_box);

            LoadExisting();
            AppLog.Line += OnLine;
            FormClosed += delegate { AppLog.Line -= OnLine; };
        }

        void LoadExisting()
        {
            try
            {
                if (!string.IsNullOrEmpty(AppLog.LogPath) && File.Exists(AppLog.LogPath))
                {
                    var text = File.ReadAllText(AppLog.LogPath);
                    if (text.Length > 200000)
                        text = text.Substring(text.Length - 200000);
                    _box.Text = text;
                    _box.SelectionStart = _box.TextLength;
                    _box.ScrollToCaret();
                }
            }
            catch { }
        }

        void OnLine(string line)
        {
            if (IsDisposed) return;
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(OnLine), line);
                return;
            }
            _box.AppendText(line + Environment.NewLine);
        }
    }
}
