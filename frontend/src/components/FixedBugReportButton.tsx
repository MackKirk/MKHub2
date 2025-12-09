import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ModalBugReport from './ModalBugReport';

export default function FixedBugReportButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const location = useLocation();

  // Don't show on login page
  if (location.pathname === '/login') {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="relative p-2 rounded-lg hover:bg-gray-700 transition-colors ml-2"
        title="Report a Bug"
        aria-label="Report a Bug"
      >
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full border border-gray-800"></span>
      </button>

      {isModalOpen && (
        <ModalBugReport
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}

