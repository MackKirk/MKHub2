using System;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;
using MkHub.SageCompanion.Hub;

namespace MkHub.SageCompanion.UI
{
    public class TrayApplicationContext : ApplicationContext
    {
        readonly NotifyIcon _icon;
        readonly ToolStripMenuItem _syncItem;
        readonly SynchronizationContext _ui;
        LogForm _logForm;
        bool _syncing;

        public TrayApplicationContext()
        {
            _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            var menu = new ContextMenuStrip();
            _syncItem = new ToolStripMenuItem("Sync now", null, delegate { SyncNow(); });
            menu.Items.Add(_syncItem);
            menu.Items.Add("Open log", null, delegate { ShowLog(); });
            menu.Items.Add("Settings", null, delegate { ShowSettings(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Exit", null, delegate { ExitThread(); });

            _icon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Visible = true,
                Text = "MKHub Sage Companion",
                ContextMenuStrip = menu
            };
            _icon.DoubleClick += delegate { ShowSettings(); };

            AppLog.Info("Companion started (this test PC, Development SAI).");
            var cfg = AppConfig.Load();
            AppLog.Info("Dry run: " + cfg.DryRun + "  SAI: " + cfg.SaiPath
                + "  Hub: " + (HubClient.IsConfigured(cfg) ? cfg.HubBaseUrl : "(not set)"));
            _icon.ShowBalloonTip(4000, "MKHub Sage Companion",
                cfg.DryRun
                    ? "Running on this test PC. Dry run is on: Sync will not write to Sage or change MKHub."
                    : "Running on this test PC. Dry run is off: Sync can post Time Slips and mark hours In Sage.",
                cfg.DryRun ? ToolTipIcon.Info : ToolTipIcon.Warning);
        }

        protected override void ExitThreadCore()
        {
            _icon.Visible = false;
            _icon.Dispose();
            base.ExitThreadCore();
        }

        void ShowLog()
        {
            if (_logForm == null || _logForm.IsDisposed)
                _logForm = new LogForm();
            _logForm.Show();
            _logForm.BringToFront();
        }

        void ShowSettings()
        {
            using (var form = new SettingsForm(AppConfig.Load()))
            {
                form.ShowDialog();
            }
        }

        void SyncNow()
        {
            if (_syncing)
            {
                _icon.ShowBalloonTip(3000, "MKHub Sage Companion", "Sync already running.", ToolTipIcon.Warning);
                return;
            }

            var cfg = AppConfig.Load();
            if (!cfg.DryRun)
            {
                var body = HubClient.IsConfigured(cfg)
                    ? "Dry run is off." + Environment.NewLine + Environment.NewLine +
                      "This will post Time Slips from the MKHub queue into this test Sage company and mark those hours In Sage:" + Environment.NewLine +
                      cfg.SaiPath + Environment.NewLine + Environment.NewLine +
                      "Confirm this is not live payroll. Continue?"
                    : "Dry run is off." + Environment.NewLine + Environment.NewLine +
                      "MKHub is not configured, so this will post ONE sample Time Slip into this test Sage company:" + Environment.NewLine +
                      cfg.SaiPath + Environment.NewLine + Environment.NewLine +
                      "Employee: " + cfg.EmployeeName + Environment.NewLine +
                      "Item: " + cfg.Item + "   Hours: " + cfg.Hours + Environment.NewLine + Environment.NewLine +
                      "Confirm this is not live payroll. Continue?";
                var ask = MessageBox.Show(
                    body,
                    "Write to test Sage?",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning,
                    MessageBoxDefaultButton.Button2);
                if (ask != DialogResult.Yes) return;
            }

            _syncing = true;
            SetSyncingUi(true);
            _icon.ShowBalloonTip(3000, "MKHub Sage Companion", "Sync started. Sage stays open until this batch finishes.", ToolTipIcon.Info);
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    var msg = SyncService.Run(cfg);
                    ShowTip(msg, ToolTipIcon.Info);
                }
                catch (Exception ex)
                {
                    AppLog.Error(ex.Message);
                    ShowTip(ex.Message, ToolTipIcon.Error);
                }
                finally
                {
                    _syncing = false;
                    SetSyncingUi(false);
                }
            });
        }

        void SetSyncingUi(bool on)
        {
            Action apply = delegate
            {
                _syncItem.Enabled = !on;
                _syncItem.Text = on ? "Sync now (running…)" : "Sync now";
                _icon.Text = on ? "MKHub Sage Companion (syncing)" : "MKHub Sage Companion";
            };
            if (_ui != null)
                _ui.Post(delegate { apply(); }, null);
            else
                apply();
        }

        void ShowTip(string msg, ToolTipIcon icon)
        {
            try
            {
                _icon.ShowBalloonTip(6000, "MKHub Sage Companion", msg.Length > 240 ? msg.Substring(0, 240) : msg, icon);
            }
            catch { }
        }
    }
}
