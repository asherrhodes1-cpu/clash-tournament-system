import React, { useEffect, useState } from 'react';
import { subscribeToAuthState } from '../api/auth';

// The control page only loads once a staff account is confirmed.
const OverlayControl = React.lazy(() => import('./OverlayControl'));

// /overlay-control is staff-only. Anyone else - signed out or not staff - is
// sent to the home page, the same as if the address didn't exist.
export default function OverlayGate() {
  // undefined until Firebase has said who (if anyone) is signed in.
  const [user, setUser] = useState(undefined);

  useEffect(() => subscribeToAuthState(setUser), []);

  useEffect(() => {
    if (user !== undefined && !user?.isStaff) window.location.replace('/');
  }, [user]);

  if (!user?.isStaff) return null;
  return <React.Suspense fallback={null}><OverlayControl /></React.Suspense>;
}
