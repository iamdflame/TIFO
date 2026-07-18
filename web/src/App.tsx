import { useEffect, useState } from 'react';
import Lobby from './components/Lobby';
import MatchView from './components/MatchView';

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const fn = () => setHash(window.location.hash);
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHashRoute();
  const m = decodeURIComponent(hash).match(/^#\/match\/(\d+)/);
  return (
    <div className="shell">
      {m ? <MatchView fixtureId={Number(m[1])} /> : <Lobby />}
    </div>
  );
}
