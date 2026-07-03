const lastUpdated = 'July 3, 2026';
const privacyContact = 'dev@mackkirk.com';

const sections = [
  {
    title: '1. Who we are',
    body: [
      'MK Hub is an operations platform used by Mack Kirk and authorized business users to manage customers, projects, work orders, inspections, fleet assets, safety records, training, files, schedules, time entries, and related business workflows.',
      'This Privacy Policy explains how information is collected, used, disclosed, retained, and protected when you use the MK Hub website, mobile application, and related services.',
    ],
  },
  {
    title: '2. Information we collect',
    body: [
      'Account and profile information, such as your name, username, email address, phone number, role, permissions, emergency contact details where applicable, and employment or contractor profile details entered into MK Hub.',
      'Operational data, such as customers, contacts, sites, projects, opportunities, proposals, quotes, tasks, schedules, work orders, inspections, safety forms, training records, fleet assignments, equipment records, corporate card records, notes, comments, and activity history.',
      'Files and media, such as documents, photos, signatures, inspection images, uploaded attachments, generated PDFs, and other content submitted through the platform.',
      'Time, attendance, and location-related information, such as clock entries, schedule information, dispatch data, and location data when a feature requires location access and you permit it on your device.',
      'Device and usage information, such as IP address, browser or device type, operating system, app version, log-in events, audit logs, crash or diagnostic information, and security-related activity.',
    ],
  },
  {
    title: '3. How we use information',
    body: [
      'To provide and operate MK Hub features, including authentication, customer management, project management, scheduling, fleet management, safety inspections, file storage, reporting, notifications, and collaboration.',
      'To maintain business records, support compliance, investigate issues, audit important actions, prevent misuse, and protect the security and integrity of the platform.',
      'To communicate with users about account access, password recovery, assignments, approvals, tasks, inspections, schedules, and other operational updates.',
      'To improve MK Hub, troubleshoot errors, monitor performance, and develop new or improved internal business features.',
    ],
  },
  {
    title: '4. Mobile permissions',
    body: [
      'Camera and photo library access may be requested so you can attach images to inspections, work orders, safety forms, customer records, project files, or other business records.',
      'Document or file access may be requested so you can upload PDFs, images, or other attachments to MK Hub.',
      'Location access may be requested for features such as clock, dispatch, schedule, site, or field workflows. Location data is collected only when enabled by the relevant feature and permitted by the user or device settings.',
      'Notification permissions may be requested so the app can show operational alerts, reminders, or updates related to MK Hub workflows.',
    ],
  },
  {
    title: '5. How we share information',
    body: [
      'Information in MK Hub is shared with authorized users inside the organization based on role, permissions, and business need.',
      'We may share information with service providers that help operate MK Hub, such as hosting, storage, email delivery, analytics, security, and infrastructure providers. These providers are expected to use information only to provide services to us.',
      'We may disclose information when required by law, regulation, legal process, safety obligations, insurance requirements, audit needs, or to protect the rights, property, or safety of Mack Kirk, MK Hub users, customers, or others.',
      'We do not sell personal information.',
    ],
  },
  {
    title: '6. Data storage and retention',
    body: [
      'MK Hub retains information for as long as needed to provide the platform, support business operations, maintain legal and compliance records, resolve disputes, enforce agreements, and preserve audit history.',
      'Some records, such as safety records, work orders, proposals, project files, accounting-related data, training records, and audit logs, may be retained for extended periods due to operational, legal, insurance, or regulatory needs.',
      'When information is no longer required, we take reasonable steps to delete, anonymize, archive, or restrict access to it according to business and legal requirements.',
    ],
  },
  {
    title: '7. Security',
    body: [
      'We use reasonable administrative, technical, and organizational safeguards designed to protect information against unauthorized access, loss, misuse, alteration, or disclosure.',
      'No system can be guaranteed to be completely secure. Users are responsible for keeping account credentials confidential and for reporting suspected unauthorized access promptly.',
    ],
  },
  {
    title: '8. Your choices and rights',
    body: [
      'You may update certain profile or account information through MK Hub where available, or by contacting an authorized MK Hub administrator.',
      'Depending on where you live, you may have rights to access, correct, delete, restrict, or receive a copy of certain personal information, subject to legal, employment, contractual, safety, audit, and business record requirements.',
      'You can manage device permissions, such as camera, photo library, location, and notifications, through your device settings. Some MK Hub features may not work as intended if required permissions are disabled.',
    ],
  },
  {
    title: '9. Cookies and local storage',
    body: [
      'MK Hub may use cookies, browser storage, device storage, and similar technologies to keep users signed in, remember preferences, protect sessions, support app functionality, and improve reliability.',
      'Disabling cookies or local storage may prevent MK Hub from functioning correctly.',
    ],
  },
  {
    title: '10. Children',
    body: [
      'MK Hub is intended for business use and is not directed to children. We do not knowingly collect personal information from children through MK Hub.',
    ],
  },
  {
    title: '11. International processing',
    body: [
      'Information may be processed or stored in Canada, the United States, or other locations where our service providers operate. Privacy and data protection laws may differ from those in your jurisdiction.',
    ],
  },
  {
    title: '12. Changes to this policy',
    body: [
      'We may update this Privacy Policy from time to time. When we make changes, we will update the "Last updated" date above. Continued use of MK Hub after an update means the updated policy applies.',
    ],
  },
  {
    title: '13. Contact',
    body: [
      `For privacy questions, requests, or concerns, contact your MK Hub administrator or email ${privacyContact}.`,
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="border-b border-slate-200 bg-gradient-to-br from-[#7f1010] to-[#a31414] px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl">
          <a href="/login" className="inline-flex items-center gap-3 text-sm font-semibold text-white/90 hover:text-white">
            <img src="/ui/assets/login/logo-light.svg" alt="" className="h-8 w-auto" />
            MKHub
          </a>
          <h1 className="mt-8 text-4xl font-extrabold tracking-tight md:text-5xl">Privacy Policy</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/90">
            This policy explains how MK Hub handles information for the web and mobile applications.
          </p>
          <p className="mt-4 text-sm font-medium text-white/80">Last updated: {lastUpdated}</p>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
          <div className="space-y-9">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-bold text-slate-950">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700 md:text-base">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 text-sm text-slate-600">
            <span>MK Hub Privacy Policy</span>
            <a href="/login" className="font-semibold text-[#a31414] hover:text-[#7f1010]">
              Back to login
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
