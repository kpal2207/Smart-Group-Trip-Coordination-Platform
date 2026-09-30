import React, { useState } from 'react';
import { disputeExpense, reviewDispute } from '../api/expense';

/**
 * DisputeModal
 * Supports two modes matching the activity diagram:
 * 1. 'create': Member reviews expense and raises a dispute.
 * 2. 'review': Host reviews dispute and chooses:
 *    - 'Keep existing split' -> keeps current split, marks accepted
 *    - 'Modify split' -> adjusts shares and recalculates
 */
const DisputeModal = ({ mode, expense, dispute, members, isOpen, onClose, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [modifySplit, setModifySplit] = useState(false);
  const [customShares, setCustomShares] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !expense) return null;

  // Initialize custom shares if host wants to modify
  const handleToggleModify = () => {
    const nextState = !modifySplit;
    setModifySplit(nextState);
    if (nextState && Object.keys(customShares).length === 0) {
      const initial = {};
      expense.splits.forEach((s) => {
        initial[s.user_id] = s.share_amount;
      });
      setCustomShares(initial);
    }
  };

  const handleShareChange = (userId, value) => {
    setCustomShares((prev) => ({ ...prev, [userId]: value }));
  };

  const currentTotalCustom = Object.values(customShares).reduce(
    (acc, val) => acc + (parseFloat(val) || 0),
    0
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        if (!reason.trim()) {
          setErrorMsg('Please specify the reason for the dispute.');
          setIsSubmitting(false);
          return;
        }
        await disputeExpense(expense.id, { reason: reason.trim() });
      } else if (mode === 'review') {
        if (modifySplit) {
          const diff = Math.abs(currentTotalCustom - parseFloat(expense.amount));
          if (diff > 0.05) {
            setErrorMsg(
              `Sum of custom shares (${currentTotalCustom.toFixed(2)}) must equal total amount (${parseFloat(expense.amount).toFixed(2)})`
            );
            setIsSubmitting(false);
            return;
          }
          const newSplits = Object.entries(customShares)
            .filter(([_, amt]) => parseFloat(amt) > 0)
            .map(([uid, amt]) => ({
              user_id: parseInt(uid, 10),
              share_amount: parseFloat(amt),
            }));

          await reviewDispute(dispute.id, {
            modify_split: true,
            new_splits: newSplits,
            notes: notes.trim() || 'Split modified by host.',
          });
        } else {
          // Keep existing split
          await reviewDispute(dispute.id, {
            modify_split: false,
            notes: notes.trim() || 'Host confirmed existing split.',
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to submit dispute update.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'Dispute Expense' : 'Host Dispute Review'}</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {errorMsg && <div className="alert alert-error" style={{ marginBottom: '14px' }}>{errorMsg}</div>}

        <div style={{ marginBottom: '16px', fontSize: '0.92rem', color: 'var(--text-muted)' }}>
          Expense: <strong style={{ color: 'var(--text-color)' }}>{expense.title}</strong> &bull; Total: {expense.currency} {parseFloat(expense.amount).toFixed(2)}
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="disputeReason">Reason for Dispute *</label>
              <textarea
                id="disputeReason"
                rows={3}
                placeholder="Explain why this split or amount is incorrect..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-color)', color: 'var(--text-color)' }}
              />
            </div>
            <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" style={{ background: '#ef4444', borderColor: '#ef4444' }} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            {dispute && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color: '#f87171' }}>Disputed by: {dispute.raised_by_name}</div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>"{dispute.reason}"</p>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={modifySplit}
                  onChange={handleToggleModify}
                />
                Modify split? (Unchecked = Keep existing split)
              </label>
            </div>

            {modifySplit && (
              <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Adjust shares for each member:</label>
                {members.map((m) => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                    <span style={{ fontSize: '0.9rem' }}>{m.name}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={customShares[m.user_id] || ''}
                      onChange={(e) => handleShareChange(m.user_id, e.target.value)}
                      style={{ width: '100px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', textAlign: 'right' }}
                    />
                  </div>
                ))}
                <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '0.85rem', color: Math.abs(currentTotalCustom - parseFloat(expense.amount)) < 0.05 ? '#34d399' : '#f87171' }}>
                  Total: {currentTotalCustom.toFixed(2)} / {parseFloat(expense.amount).toFixed(2)}
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="hostNotes">Host Review Notes (optional)</label>
              <input
                id="hostNotes"
                type="text"
                placeholder="Reason or explanation for resolution..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
                {isSubmitting ? 'Resolving...' : modifySplit ? 'Update Split' : 'Keep Existing Split'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default DisputeModal;
