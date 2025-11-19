import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

type Certificate = {
  id: string;
  course_id: string;
  course_title?: string;
  issued_at: string;
  expires_at?: string;
  certificate_number: string;
  qr_code_data?: string;
  certificate_file_id?: string;
  is_expired: boolean;
};

export default function TrainingCertificates() {
  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ['training-certificates'],
    queryFn: () => api<Certificate[]>('GET', '/training/certificates'),
  });

  const validCertificates = certificates?.filter((c) => !c.is_expired) || [];
  const expiredCertificates = certificates?.filter((c) => c.is_expired) || [];

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">My Certificates</div>
        <div className="text-sm opacity-90">View and download your training certificates.</div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Valid Certificates */}
          {validCertificates.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4">Valid Certificates</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {validCertificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="border rounded-xl bg-white p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg mb-2">{cert.course_title}</h3>
                        <p className="text-sm text-gray-600">
                          Issued: {new Date(cert.issued_at).toLocaleDateString()}
                        </p>
                        {cert.expires_at && (
                          <p className="text-sm text-gray-600">
                            Expires: {new Date(cert.expires_at).toLocaleDateString()}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Certificate #: {cert.certificate_number}
                        </p>
                      </div>
                      {cert.qr_code_data && (
                        <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
                          <span className="text-xs">QR</span>
                        </div>
                      )}
                    </div>
                    {cert.certificate_file_id && (
                      <a
                        href={`/files/${cert.certificate_file_id}`}
                        download
                        className="block w-full text-center px-4 py-2 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors"
                      >
                        Download PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expired Certificates */}
          {expiredCertificates.length > 0 && (
            <div>
              <h2 className="text-xl font-bold mb-4 text-orange-600">Expired Certificates</h2>
              <div className="grid md:grid-cols-3 gap-4">
                {expiredCertificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="border rounded-xl bg-white p-6 opacity-75 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg mb-2">{cert.course_title}</h3>
                        <p className="text-sm text-gray-600">
                          Issued: {new Date(cert.issued_at).toLocaleDateString()}
                        </p>
                        {cert.expires_at && (
                          <p className="text-sm text-orange-600 font-semibold">
                            Expired: {new Date(cert.expires_at).toLocaleDateString()}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          Certificate #: {cert.certificate_number}
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/training/${cert.course_id}`}
                      className="block w-full text-center px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors"
                    >
                      Renew Training
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {certificates?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg">You don't have any certificates yet.</p>
              <p className="text-sm mt-2">Complete training courses to earn certificates.</p>
              <Link
                to="/training"
                className="inline-block mt-4 px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors"
              >
                Browse Courses
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

