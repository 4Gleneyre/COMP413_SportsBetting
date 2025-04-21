import { Suspense } from 'react';
import ProfilePage from './ProfilePage';

export default function ProfilePageWrapper() {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <ProfilePage />
    </Suspense>
  );
}