import './WelcomeHeader.css';

interface WelcomeHeaderProps {
  user: string;
}

export function WelcomeHeader({ user }: WelcomeHeaderProps) {
  return (
    <header className="welcome-header">
      <h1 className="welcome-text">Willkommen, {user}</h1>
    </header>
  );
}
