"""Email templates for Hub customer portal invites (layout aligned with staff hub invite)."""
from __future__ import annotations


def portal_invite_email_text(
    *,
    invitee_email: str,
    invite_link: str,
    client_name: str,
    inviter_name: str,
    app_name: str,
    expires_days: int = 14,
) -> str:
    return f"""
You're invited to the {app_name} customer portal

Hello,

{inviter_name} invited you to the {app_name} customer portal for {client_name}.

This invitation is locked to {invitee_email}. Open the link below to create your account and set a password:

{invite_link}

Once signed in, you will be able to view projects where {client_name} is the owner or awarded contractor, plus shared files and documents.

This invitation link will expire in {expires_days} days. If you did not expect this email, you can ignore it.

Best regards,
{inviter_name}
""".strip()


def portal_invite_email_html(
    *,
    invitee_email: str,
    invite_link: str,
    client_name: str,
    inviter_name: str,
    inviter_email: str,
    app_name: str,
    public_base_url: str,
    expires_days: int = 14,
) -> str:
    logo_url = f"{public_base_url.rstrip('/')}/proposals/assets/logo.png"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're invited to the {app_name} customer portal</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f7f9;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb;">
                    <!-- Header with Logo -->
                    <tr>
                        <td align="center" style="padding: 40px 20px 30px; background: linear-gradient(135deg, #7f1010 0%, #a31414 100%); border-radius: 12px 12px 0 0;">
                            <img src="{logo_url}" alt="{app_name}" style="max-width: 300px; height: auto; display: block;" />
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                                You're invited to the {app_name} customer portal
                            </h1>

                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                                Hello,
                            </p>

                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                                <strong>{inviter_name}</strong> invited you to the <strong>{app_name}</strong> customer portal
                                for <strong>{client_name}</strong>.
                            </p>

                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                                This invitation is locked to <strong>{invitee_email}</strong>. Create your account to view projects
                                where this company is the owner or awarded contractor, plus shared files and documents.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; margin: 30px 0;">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <!--[if mso]>
                                        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{invite_link}" style="height:46px;v-text-anchor:middle;width:280px;" arcsize="8%" stroke="f" fillcolor="#d11616">
                                            <w:anchorlock/>
                                            <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Create your account</center>
                                        </v:roundrect>
                                        <![endif]-->
                                        <!--[if !mso]><!-- -->
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: auto;">
                                            <tr>
                                                <td style="background-color: #d11616; border-radius: 8px; text-align: center;">
                                                    <a href="{invite_link}" style="background-color: #d11616; border: 2px solid #d11616; border-radius: 8px; color: #ffffff; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; font-weight: 700; line-height: 1.5; text-decoration: none; text-align: center; padding: 14px 32px; -webkit-text-size-adjust: none; mso-hide: all;">
                                                        Create your account
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        <!--<![endif]-->
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 30px 0 20px 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                                Or copy and paste this link into your browser:
                            </p>
                            <p style="margin: 0 0 30px 0; font-size: 14px; line-height: 1.6; color: #2563eb; word-break: break-all;">
                                {invite_link}
                            </p>

                            <div style="border-top: 1px solid #e5e7eb; padding-top: 30px; margin-top: 30px;">
                                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                                    This invitation link will expire in {expires_days} days. If you did not expect this email, you can ignore it.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer with Signature -->
                    <tr>
                        <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
                            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: 600; color: #0f172a;">
                                Best regards,
                            </p>
                            <p style="margin: 0 0 5px 0; font-size: 15px; color: #374151;">
                                {inviter_name}
                            </p>
                            <p style="margin: 0; font-size: 14px; color: #6b7280;">
                                {inviter_email}
                            </p>
                        </td>
                    </tr>
                </table>

                <table role="presentation" style="max-width: 600px; width: 100%; margin-top: 20px;">
                    <tr>
                        <td align="center" style="padding: 20px;">
                            <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                                This message was sent by {app_name}.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""
