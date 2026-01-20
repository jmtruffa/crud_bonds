import React, { useEffect, useState } from 'react';
import { getBonds, createBond, updateBond, deleteBond } from './api';
import BondList from './components/BondList';
import BondForm from './components/BondForm';
import './style.css';

function App() {
  const [bonds, setBonds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await getBonds();
      setBonds(rows);
    } catch (e) {
      console.error(e);
      alert('Failed to load bonds');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

 async function handleSave(bond) {
  try {
    if (bond.id && !isCloning) {
      await updateBond(bond.id, bond);
    } else {
      await createBond(bond);
    }
    setShowForm(false);
    setEditing(null);
    setIsCloning(false);  // ← AGREGAR esta línea
    load();
  } catch (e) {
    console.error(e);
    alert('Save failed: ' + e.message);
  }
}

  async function handleDelete(id) {
    if (!window.confirm('Delete bond?')) return;
    try {
      await deleteBond(id);
      load();
    } catch (e) {
      console.error(e);
      alert('Delete failed');
    }
  }

  function handleClone(bond) {
  setEditing(bond);
  setIsCloning(true);
  setShowForm(true);
}
  return (
    <div className="app-container">
      <header>
        <h1>CRUD Bonds</h1>
        <div>
          <button className="btn btn-success" onClick={() => { setEditing({}); setIsCloning(false); setShowForm(true); }}>+ New Bond</button>
        </div>
      </header>

      <main>
        <section>
          {loading ? <div className="loading">Loading bonds...</div> : (
            <BondList
              bonds={bonds}
              onEdit={(b) => { setEditing(b); setShowForm(true); }}
              onDelete={handleDelete}
              onClone={handleClone}
            />
          )}
        </section>

        {showForm && (
          <div className="modal-overlay">
            <div className="modal-content">
              <BondForm initial={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); setIsCloning(false);}} isClone={isCloning} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
