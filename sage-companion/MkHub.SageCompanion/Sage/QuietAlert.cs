using System;
using Simply.Domain.Utility;
using SimplySDK;
using SimplySDK.Support;

namespace MkHub.SageCompanion.Sage
{
    public class QuietAlert : SDKAlert
    {
        public override AlertResult AskAlert(SimplyMessage message)
        {
            AppLog.Info("[Sage ask] " + message.Message);
            return AlertResult.NO;
        }

        public override AlertResult AskSaveAlert()
        {
            return AlertResult.NO;
        }

        public override AlertResult YNCAlert(SimplyMessage message)
        {
            AppLog.Info("[Sage y/n/c] " + message.Message);
            return AlertResult.NO;
        }

        public override void StopAlert(SimplyMessage message)
        {
            AppLog.Info("[Sage stop] " + message.Message);
        }

        public override bool StopAlertNotShow(SimplyMessage message)
        {
            AppLog.Info("[Sage] " + message.Message);
            return false;
        }
    }
}
