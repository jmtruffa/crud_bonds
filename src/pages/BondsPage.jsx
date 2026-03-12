import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBonds, createBond, updateBond, setToken } from '../api';
import BondList from '../components/BondList';

export default function BondsPage() {
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBonds(await getBonds());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleLogout() {
    setToken(null);
    navigate('/login', { replace: true });
  }

  async function handleSave(id, bondData) {
    if (id) {
      await updateBond(id, bondData);
    } else {
      await createBond(bondData);
    }
    load();
  }

  return (
    <div className="app-container">
      <header>
        <h1>CRUD Bonds</h1>
        <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
      </header>
      <main>
        {loading ? <div className="loading">Loading bonds...</div> : (
          <BondList bonds={bonds} onSave={handleSave} onRefresh={load} />
        )}
      </main>
    </div>
  );
}
