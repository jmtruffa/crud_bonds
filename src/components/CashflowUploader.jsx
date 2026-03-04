import { useState, useEffect, useRef } from 'react';
import { getCashflows, createCashflow, updateCashflow, deleteCashflow } from '../api';

export default function CashflowUploader({ bond }) {
  const [cashflows, setCashflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [editingRows, setEditingRows] = useState({});
  const [lastSeq, setLastSeq] = useState(0);
  const [lastResidual, setLastResidual] = useState(100);
  const [newCashflows, setNewCashflows] = useState([]);
  const tableRef = useRef(null);

  async function load() {
    if (!bond) return;
    setLoading(true);
    try {
      const rows = await getCashflows(bond.id);
      setCashflows(rows);
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        setLastSeq(last.seq);
        setLastResidual(last.residual);
      } else {
        setLastSeq(0);
        setLastResidual(100);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to load cashflows');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [bond]);

  const handleEditStart = (cfId) => {
    const cf = cashflows.find(c => c.id === cfId);
    if (cf) {
      setEditingRows(prev => ({
        ...prev,
        [cfId]: {
          seq: cf.seq.toString(),
          date: cf.date,
          rate: cf.rate.toString(),
          amort: cf.amort.toString(),
          residual: cf.residual.toString(),
          amount: cf.amount.toString()
        }
      }));
    }
  };

  const handleEditChange = (cfId, field, value) => {
    setEditingRows(prev => ({
      ...prev,
      [cfId]: {
        ...prev[cfId],
        [field]: value
      }
    }));
  };

  const handleEditCancel = (cfId) => {
    setEditingRows(prev => {
      const newState = { ...prev };
      delete newState[cfId];
      return newState;
    });
  };

  async function handleEditSave(cfId) {
    const editData = editingRows[cfId];
    const data = {
      seq: parseInt(editData.seq),
      date: editData.date,
      rate: parseFloat(editData.rate),
      amort: parseFloat(editData.amort),
      residual: parseFloat(editData.residual),
      amount: parseFloat(editData.amount)
    };

    try {
      await updateCashflow(bond.id, cfId, data);
      load();
      handleEditCancel(cfId);
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    }
  }

  const handleAddNewRow = () => {
    const tempId = `new-${Date.now()}`;
    const newRow = {
      tempId,
      seq: (lastSeq + newCashflows.length + 1).toString(),
      date: '',
      rate: '',
      amort: '',
      residual: lastResidual.toString(),
      amount: ''
    };
    setNewCashflows(prev => [...prev, newRow]);
    
    // Scroll to the new row
    setTimeout(() => {
      const element = document.getElementById(`new-row-${tempId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 0);
  };

  const handleNewCashflowChange = (tempId, field, value) => {
    setNewCashflows(prev => 
      prev.map(row => row.tempId === tempId ? { ...row, [field]: value } : row)
    );
  };

  async function handleNewCashflowSave(tempId) {
    const newRow = newCashflows.find(row => row.tempId === tempId);
    const data = {
      seq: parseInt(newRow.seq),
      date: newRow.date,
      rate: parseFloat(newRow.rate),
      amort: parseFloat(newRow.amort),
      residual: parseFloat(newRow.residual),
      amount: parseFloat(newRow.amount)
    };

    try {
      if (!data.date || !data.amort || !data.amount) {
        alert('Please fill in all required fields');
        return;
      }
      await createCashflow(bond.id, data);
      load();
      setNewCashflows(prev => prev.filter(row => row.tempId !== tempId));
    } catch (err) {
      console.error(err);
      alert('Save failed: ' + err.message);
    }
  }

  const handleNewCashflowCancel = (tempId) => {
    setNewCashflows(prev => prev.filter(row => row.tempId !== tempId));
  };

  async function handleDelete(cfId) {
    if (!window.confirm('Delete this cashflow?')) return;
    try {
      await deleteCashflow(bond.id, cfId);
      load();
    } catch (err) {
      console.error('Delete error:', err);
      const errorMsg = err.error || err.message || 'Unknown error';
      alert('Delete failed: ' + errorMsg);
    }
  }

  if (!bond) return null;

  return (
    <div className="cashflow-container">
      <h4>Cashflows Management</h4>
      
      <div className="cashflow-buttons">
        <button 
          className="btn"
          onClick={() => setShowTable(!showTable)}
        >
          {showTable ? '▼ Hide' : '▶ Show'} Cashflows Table ({cashflows.length})
        </button>
      </div>

      {showTable && (
        loading ? (
          <div className="loading">Loading cashflows...</div>
        ) : (
          <div className="cashflow-table-wrapper">
            {cashflows.length === 0 && <p style={{ marginBottom: '1rem', color: '#999' }}>No cashflows yet.</p>}
            <table className="table editable-table" ref={tableRef}>
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Date</th>
                  <th>Rate</th>
                  <th>Amort</th>
                  <th>Residual</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cashflows.map(c => {
                  const isEditing = editingRows[c.id];
                  const rowData = isEditing || {};
                  
                  return (
                    <tr key={c.id} className={isEditing ? 'editing-row' : ''}>
                      <td>
                        <input 
                          type="number" 
                          value={isEditing ? rowData.seq : c.seq}
                          onChange={(e) => handleEditChange(c.id, 'seq', e.target.value)}
                          className="edit-input"
                          readOnly={!isEditing}
                        />
                      </td>
                      <td>
                        <input 
                          type="date" 
                          value={isEditing ? (typeof rowData.date === 'string' ? rowData.date.split('T')[0] : rowData.date) : (typeof c.date === 'string' ? c.date.split('T')[0] : c.date)}
                          onChange={(e) => handleEditChange(c.id, 'date', e.target.value)}
                          className="edit-input"
                          readOnly={!isEditing}
                          required
                          autoFocus
                        />
                      </td>
                      <td>
                        <input 
                          type="number" 
                          step="0.00001"
                          value={isEditing ? rowData.rate : parseFloat(c.rate).toFixed(4)}
                          onChange={(e) => handleEditChange(c.id, 'rate', e.target.value)}
                          className="edit-input"
                          readOnly={!isEditing}
                        />
                      </td>
                      <td>
                        <input 
                          type="number" 
                          step="0.01"
                          value={isEditing ? rowData.amort : parseFloat(c.amort).toFixed(2)}
                          onChange={(e) => handleEditChange(c.id, 'amort', e.target.value)}
                          className="edit-input"
                          readOnly={!isEditing}
                        />
                      </td>
                      <td>
                        <input 
                          type="number" 
                          step="0.01"
                          value={isEditing ? rowData.residual : parseFloat(c.residual).toFixed(2)}
                          readOnly
                          className="edit-input"
                        />
                      </td>
                      <td>
                        <input 
                          type="number" 
                          step="0.01"
                          value={isEditing ? rowData.amount : parseFloat(c.amount).toFixed(2)}
                          onChange={(e) => handleEditChange(c.id, 'amount', e.target.value)}
                          className="edit-input"
                          readOnly={!isEditing}
                        />
                      </td>
                      <td className="table-actions">
                        {isEditing ? (
                          <>
                            <button 
                              className="btn btn-sm btn-success" 
                              onClick={() => handleEditSave(c.id)}
                            >
                              Save
                            </button>
                            <button 
                              className="btn btn-sm btn-secondary" 
                              onClick={() => handleEditCancel(c.id)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              className="btn btn-sm btn-secondary" 
                              onClick={() => handleEditStart(c.id)}
                            >
                              Edit
                            </button>
                            <button 
                              className="btn btn-sm btn-danger" 
                              onClick={() => handleDelete(c.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {newCashflows.map(newRow => (
                  <tr key={newRow.tempId} id={`new-row-${newRow.tempId}`} className="editing-row">
                    <td>
                      <input 
                        type="number" 
                        value={newRow.seq}
                        className="edit-input"
                        readOnly
                      />
                    </td>
                    <td>
                      <input 
                        type="date" 
                        value={newRow.date}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'date', e.target.value)}
                        className="edit-input"
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.00001"
                        value={newRow.rate}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'rate', e.target.value)}
                        className="edit-input"
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newRow.amort}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'amort', e.target.value)}
                        className="edit-input"
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newRow.residual}
                        className="edit-input"
                        readOnly
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        step="0.01"
                        value={newRow.amount}
                        onChange={(e) => handleNewCashflowChange(newRow.tempId, 'amount', e.target.value)}
                        className="edit-input"
                      />
                    </td>
                    <td className="table-actions">
                      <button 
                        className="btn btn-sm btn-success" 
                        onClick={() => handleNewCashflowSave(newRow.tempId)}
                      >
                        Save
                      </button>
                      <button 
                        className="btn btn-sm btn-secondary" 
                        onClick={() => handleNewCashflowCancel(newRow.tempId)}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cashflow-table-footer">
              <button 
                className="btn btn-secondary"
                onClick={handleAddNewRow}
                disabled={lastResidual <= 0}
              >
                ➕ Add New Cashflow
              </button>
              {lastResidual <= 0 && (
                <span className="residual-warning">Residual is 0. No more cashflows can be added.</span>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
