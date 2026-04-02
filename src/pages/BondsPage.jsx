import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBonds, createBond, createLecap, createTamar, updateBond, setToken } from '../api';
import BondList from '../components/BondList';
import MarketBanner from '../components/MarketBanner';
import LecapsCreateForm from '../components/LecapsCreateForm';
import TamarCreateForm from '../components/TamarCreateForm';
import FuturosTab from '../components/FuturosTab';
import SettingsModal from '../components/SettingsModal';

export default function BondsPage() {
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('bonds');
  const [showSettings, setShowSettings] = useState(false);
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

  async function handleCreateTamar(tamarData) {
    await createTamar(tamarData);
  }

  return (
    <div className="app-container">
      <header>
        <h1>OUTLIER TERMINAL</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm btn-gear" onClick={() => setShowSettings(true)}>&#9881;</button>
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <MarketBanner />
      <main>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            className={`btn ${activeTab === 'bonds' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('bonds')}
          >
            BONOS-ON
          </button>
          <button
            className={`btn ${activeTab === 'lecaps' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('lecaps')}
          >
            LECAPS
          </button>
          <button
            className={`btn ${activeTab === 'tamar' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('tamar')}
          >
            TAMAR
          </button>
          <button
            className={`btn ${activeTab === 'futuros' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('futuros')}
          >
            FUTUROS
          </button>
        </div>
        {activeTab === 'bonds' ? (
          loading ? <div className="loading">Loading bonds...</div> : (
            <BondList bonds={bonds} onSave={handleSave} onRefresh={load} />
          )
        ) : activeTab === 'lecaps' ? (
          <LecapsCreateForm onCreate={handleCreateLecap} />
        ) : activeTab === 'tamar' ? (
          <TamarCreateForm onCreate={handleCreateTamar} />
        ) : (
          <FuturosTab />
        )}
      </main>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
