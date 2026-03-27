import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBonds, createBond, createLecap, updateBond, setToken } from '../api';
import BondList from '../components/BondList';
import LecapsCreateForm from '../components/LecapsCreateForm';

export default function BondsPage() {
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('bonds');
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

  async function handleCreateLecap(lecapData) {
    await createLecap(lecapData);
  }

  return (
    <div className="app-container">
      <header>
        <h1>CRUD Bonds</h1>
        <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
      </header>
      <main>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            className={`btn ${activeTab === 'bonds' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('bonds')}
          >
            Bonds
          </button>
          <button
            className={`btn ${activeTab === 'lecaps' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('lecaps')}
          >
            LECAPS
          </button>
        </div>
        {activeTab === 'bonds' ? (
          loading ? <div className="loading">Loading bonds...</div> : (
            <BondList bonds={bonds} onSave={handleSave} onRefresh={load} />
          )
        ) : (
          <LecapsCreateForm onCreate={handleCreateLecap} />
        )}
      </main>
    </div>
  );
}
