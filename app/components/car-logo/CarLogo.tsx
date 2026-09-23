export default function CarLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 17H3.5a1 1 0 0 1-1-1v-3.2a2 2 0 0 1 1.3-1.9L6 10l1.8-3.4A2 2 0 0 1 9.6 5.5h4.8a2 2 0 0 1 1.8 1.1L18 10l2.2.9a2 2 0 0 1 1.3 1.9V16a1 1 0 0 1-1 1H19" />
      <path d="M7.5 10h9" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="16.5" cy="17" r="2" />
      <path d="M9.5 17h5" />
    </svg>
  );
}
