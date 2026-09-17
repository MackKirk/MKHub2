using System;
using System.Drawing;
using System.Windows.Forms;

namespace MkHub.SageCompanion.UI
{
    public class SettingsForm : Form
    {
        static readonly Color PageBg = Color.FromArgb(248, 249, 251);
        static readonly Color CardBorder = Color.FromArgb(220, 224, 230);
        static readonly Color TextMain = Color.FromArgb(33, 37, 41);
        static readonly Color TextMuted = Color.FromArgb(90, 98, 108);
        static readonly Color SafeBg = Color.FromArgb(232, 245, 233);
        static readonly Color SafeFg = Color.FromArgb(27, 94, 32);
        static readonly Color WarnBg = Color.FromArgb(255, 243, 224);
        static readonly Color WarnFg = Color.FromArgb(132, 72, 0);

        readonly TextBox _sai;
        readonly TextBox _user;
        readonly TextBox _password;
        readonly TextBox _importExe;
        readonly TextBox _hubUrl;
        readonly TextBox _hubSecret;
        readonly TextBox _employee;
        readonly TextBox _item;
        readonly TextBox _customer;
        readonly TextBox _hours;
        readonly CheckBox _dryRun;
        readonly Panel _dryBanner;
        readonly Label _dryTitle;
        readonly Label _dryBody;

        public SettingsForm(AppConfig cfg)
        {
            Text = "MKHub Sage Companion — Settings";
            Width = 760;
            Height = 860;
            MinimumSize = new Size(720, 680);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9f);
            BackColor = PageBg;
            MaximizeBox = false;

            var buttons = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 64,
                BackColor = Color.White,
                Padding = new Padding(16, 12, 16, 12)
            };
            var test = MakeButton("Test Sage connection", 180);
            var testHub = MakeButton("Test MKHub queue", 170);
            var save = MakeButton("Save", 110);
            var close = MakeButton("Close", 110);
            test.Click += delegate { TestOpen(); };
            testHub.Click += delegate { TestHub(); };
            save.Click += delegate { Save(); };
            close.Click += delegate { Close(); };
            buttons.Controls.Add(close);
            buttons.Controls.Add(save);
            buttons.Controls.Add(test);
            buttons.Controls.Add(testHub);
            close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            save.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            test.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            testHub.Anchor = AnchorStyles.Top | AnchorStyles.Left;
            close.Left = buttons.Width - close.Width - 16;
            save.Left = close.Left - save.Width - 8;
            test.Left = 16;
            testHub.Left = test.Right + 8;
            buttons.Resize += delegate
            {
                close.Left = buttons.ClientSize.Width - close.Width - 16;
                save.Left = close.Left - save.Width - 8;
            };

            var scroll = new Panel
            {
                Dock = DockStyle.Fill,
                AutoScroll = true,
                Padding = new Padding(18, 16, 18, 8)
            };

            var stack = new TableLayoutPanel
            {
                ColumnCount = 1,
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(0, 0, 12, 0)
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            stack.Controls.Add(IntroBanner());

            var company = Section(
                "1. Sage company file",
                "This is the Sage company this PC will open. On this machine it must be the Development / test copy — not the live payroll file.");
            _sai = AddField(company, "Company file (.SAI)", cfg.SaiPath, "Path to the test backup. If this points at live Sage, test hours would go into real books.");
            var browse = new Button { Text = "Browse…", AutoSize = true, Margin = new Padding(0, 4, 0, 8) };
            browse.Click += delegate
            {
                using (var dlg = new OpenFileDialog())
                {
                    dlg.Filter = "Sage company (*.SAI)|*.SAI|All files (*.*)|*.*";
                    dlg.FileName = _sai.Text;
                    if (dlg.ShowDialog(this) == DialogResult.OK) _sai.Text = dlg.FileName;
                }
            };
            company.Controls.Add(browse);
            _importExe = AddField(company, "Sage importer (advanced)", cfg.ImportExe,
                "Sage_SA_import.exe that ships with Sage 50. Change this only if Sage is installed somewhere else.");
            stack.Controls.Add(WrapSection(company));

            var login = Section(
                "2. Sage login",
                "This is a Sage user (not Windows, not MKHub). Sage will not let the same username be signed in twice — close Sage for this user before testing.");
            _user = AddField(login, "Sage user", cfg.SageUser, "Example: sysadmin on Development, or a dedicated integration user.");
            _password = AddField(login, "Sage password", cfg.SagePassword, "Stored only on this PC in the settings file. It is never sent to MKHub.");
            _password.UseSystemPasswordChar = true;
            stack.Controls.Add(WrapSection(login));

            var hub = Section(
                "3. MKHub queue",
                "When URL and secret are set, Sync now pulls approved hours from MKHub, writes Time Slips, then marks those rows In Sage. Same secret as SAGE_COMPANION_SECRET on the API.");
            hub.BackColor = Color.FromArgb(239, 246, 255);
            _hubUrl = AddField(hub, "MKHub API URL", cfg.HubBaseUrl,
                "The FastAPI server, not the Vite UI. Local default is http://127.0.0.1:8000");
            _hubSecret = AddField(hub, "Companion secret", cfg.HubSecret,
                "Must match SAGE_COMPANION_SECRET in the Hub .env. Stored only on this PC.");
            _hubSecret.UseSystemPasswordChar = true;
            stack.Controls.Add(WrapSection(hub));

            var testSlip = Section(
                "4. Defaults — fallbacks and sample slip",
                "If MKHub URL and secret are set, these are used only when a queue row is missing employee, item, or customer. If they are not set, Sync still posts ONE sample Time Slip (old test mode). Employee must match Sage exactly.");
            _employee = AddField(testSlip, "Employee (Sage name)", cfg.EmployeeName,
                "Not the MKHub login. This is the name on the Sage employee ledger, for example “Lee Ouderkirk”.");
            _item = AddField(testSlip, "Item / activity", cfg.Item,
                "Default Sage service item (101 on this test company). No money is sent from MKHub — Sage uses the price on the item card.");
            _customer = AddField(testSlip, "Customer", cfg.Customer,
                "VeriClock Time Slips usually use “0 Customer”. Leave that unless accounting says otherwise.");
            _hours = AddField(testSlip, "Sample slip hours", cfg.Hours,
                "Used only for the sample slip when MKHub is not configured. Use 01:00:00 or just 1 for one hour.");
            stack.Controls.Add(WrapSection(testSlip));

            var dry = Section(
                "5. Dry run (safe mode)",
                "");
            _dryRun = new CheckBox
            {
                Text = "Dry run on — do not write to Sage or change MKHub",
                AutoSize = true,
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                Margin = new Padding(0, 4, 0, 8),
                Checked = cfg.DryRun
            };
            _dryBanner = new TableLayoutPanel
            {
                ColumnCount = 1,
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(12),
                Margin = new Padding(0, 0, 0, 8)
            };
            _dryTitle = new Label { AutoSize = true, Font = new Font("Segoe UI", 9.5f, FontStyle.Bold), MaximumSize = new Size(640, 0) };
            _dryBody = new Label { AutoSize = true, MaximumSize = new Size(640, 0), Margin = new Padding(0, 6, 0, 0) };
            _dryBanner.Controls.Add(_dryTitle);
            _dryBanner.Controls.Add(_dryBody);
            _dryRun.CheckedChanged += delegate { RefreshDryRunBanner(); };
            dry.Controls.Add(_dryRun);
            dry.Controls.Add(_dryBanner);
            stack.Controls.Add(WrapSection(dry));
            RefreshDryRunBanner();

            scroll.Controls.Add(stack);
            Controls.Add(scroll);
            Controls.Add(buttons);
            AcceptButton = save;
            CancelButton = close;
        }

        static Button MakeButton(string text, int width)
        {
            return new Button
            {
                Text = text,
                Width = width,
                Height = 36,
                Top = 8,
                FlatStyle = FlatStyle.System
            };
        }

        static Label IntroBanner()
        {
            return new Label
            {
                AutoSize = true,
                MaximumSize = new Size(680, 0),
                Margin = new Padding(0, 0, 0, 14),
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = TextMain,
                Text = "This companion runs on this test PC. It pulls queued hours from MKHub and posts Sage Time Slips here. The MKHub website never writes to Sage. Keep Dry run on until you mean to update the Development company file."
            };
        }

        static TableLayoutPanel Section(string title, string help)
        {
            var box = new TableLayoutPanel
            {
                ColumnCount = 1,
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(14, 12, 14, 10),
                BackColor = Color.White
            };
            box.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            box.Controls.Add(new Label
            {
                Text = title,
                AutoSize = true,
                Font = new Font("Segoe UI Semibold", 11f, FontStyle.Bold),
                ForeColor = TextMain,
                Margin = new Padding(0, 0, 0, 4)
            });
            if (!string.IsNullOrEmpty(help))
            {
                box.Controls.Add(new Label
                {
                    Text = help,
                    AutoSize = true,
                    MaximumSize = new Size(660, 0),
                    ForeColor = TextMuted,
                    Margin = new Padding(0, 0, 0, 10)
                });
            }
            return box;
        }

        static Panel WrapSection(Control inner)
        {
            inner.Dock = DockStyle.Top;
            var wrap = new Panel
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(1),
                Margin = new Padding(0, 0, 0, 12),
                BackColor = CardBorder
            };
            wrap.Controls.Add(inner);
            return wrap;
        }

        static TextBox AddField(TableLayoutPanel parent, string label, string value, string hint)
        {
            parent.Controls.Add(new Label
            {
                Text = label,
                AutoSize = true,
                Font = new Font("Segoe UI Semibold", 9f, FontStyle.Bold),
                ForeColor = TextMain,
                Margin = new Padding(0, 6, 0, 2)
            });
            var box = new TextBox
            {
                Text = value ?? "",
                Dock = DockStyle.Top,
                Margin = new Padding(0, 0, 0, 2)
            };
            parent.Controls.Add(box);
            parent.Controls.Add(new Label
            {
                Text = hint,
                AutoSize = true,
                MaximumSize = new Size(640, 0),
                ForeColor = TextMuted,
                Margin = new Padding(0, 0, 0, 8)
            });
            return box;
        }

        void RefreshDryRunBanner()
        {
            if (_dryRun.Checked)
            {
                _dryBanner.BackColor = SafeBg;
                _dryTitle.ForeColor = SafeFg;
                _dryBody.ForeColor = SafeFg;
                _dryTitle.Text = "Safe mode (recommended for now)";
                _dryBody.Text = "Sync now pulls the MKHub queue and writes import files to the log. Sage is not updated and Attendance stays Queued. Use this to check names, items, and hours first.";
            }
            else
            {
                _dryBanner.BackColor = WarnBg;
                _dryTitle.ForeColor = WarnFg;
                _dryBody.ForeColor = WarnFg;
                _dryTitle.Text = "Dry run is off — Sage and MKHub will be updated";
                _dryBody.Text = "The next Sync writes Time Slips into the .SAI in section 1 and marks those hours In Sage on MKHub. Confirm that is not live payroll. You will still get a confirmation prompt.";
            }
            _dryBanner.PerformLayout();
        }

        AppConfig ReadForm()
        {
            return new AppConfig
            {
                SaiPath = _sai.Text.Trim(),
                SageUser = _user.Text.Trim(),
                SagePassword = _password.Text,
                ImportExe = _importExe.Text.Trim(),
                HubBaseUrl = _hubUrl.Text.Trim(),
                HubSecret = _hubSecret.Text.Trim(),
                EmployeeName = _employee.Text.Trim(),
                Item = _item.Text.Trim(),
                Customer = _customer.Text.Trim(),
                Hours = _hours.Text.Trim(),
                DryRun = _dryRun.Checked
            };
        }

        void Save()
        {
            var cfg = ReadForm();
            cfg.Save();
            AppLog.Info("Settings saved to " + AppConfig.ConfigPath);
            MessageBox.Show(this,
                cfg.DryRun
                    ? "Settings saved. Dry run is still on: Sync will not write to Sage or change MKHub."
                    : "Settings saved. Dry run is off: the next Sync can post Time Slips and mark hours In Sage.",
                "MKHub Sage Companion",
                MessageBoxButtons.OK,
                cfg.DryRun ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        }

        void TestOpen()
        {
            try
            {
                var msg = SyncService.TestOpen(ReadForm());
                MessageBox.Show(this,
                    msg + Environment.NewLine + Environment.NewLine + "This only opened Sage to confirm the login. No hours were posted.",
                    "Connection OK",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                AppLog.Error(ex.Message);
                MessageBox.Show(this, ex.Message, "Could not open Sage", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        void TestHub()
        {
            try
            {
                var msg = SyncService.TestHub(ReadForm());
                MessageBox.Show(this,
                    msg + Environment.NewLine + Environment.NewLine + "This only read the queue. Sage was not updated and MKHub was not changed.",
                    "MKHub queue OK",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                AppLog.Error(ex.Message);
                MessageBox.Show(this, ex.Message, "Could not reach MKHub", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
