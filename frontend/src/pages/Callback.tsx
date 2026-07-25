import { useHandleSignInCallback } from '@logto/react';
import { useNavigate } from 'react-router';

export default function Callback() {
  const navigate = useNavigate();
  const { isLoading } = useHandleSignInCallback(() => {
    // Navigate to root path when finished
    navigate('/');
  });

  // When it's working in progress
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-muted-strong">Redirecting...</div>
      </div>
    );
  }

  return null;
};
