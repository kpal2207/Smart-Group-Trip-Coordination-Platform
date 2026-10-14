import React, { useState } from 'react';
import { settleBalance } from '../api/expense';

/**
 * SettleUpModal
 * Allows a member to record a payment to another member to settle debt.
 * Matches activity diagram:
 *   Members settle balances -> Checks if all balances cleared.
 */
const SettleUpModal = ({ tripId, members, defaultPayeeId, defaultAmount, isOpen, onClose, onSuccess }) => {
  const [payeeId, setPayeeId] = useState(defaultPayeeId || (members[0]?.user_id || ''));
  const [amount, setAmount] = useState(defaultAmount ? defaultAmount.toString() : '');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    if (!payeeId) {
      setErrorMsg('Please select a member to pay.');
      return;
    }

    setIsSubmitting(true);
    try {
      await settleBalance(tripId, {
        payee_id: parseInt(payeeId, 10),
        amount: parsedAmount,
        notes: notes.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to record settlement payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settle Up Balance</h3>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {errorMsg && <div className="alert alert-error" style={{ marginBottom: '14px' }}>{errorMsg}</div>}

        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
          Record a payment made to another member (e.g. via Cash, UPI, Venmo) to reduce outstanding balance.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="payeeSelect">Paid To *</label>
            <select
              id="payeeSelect"
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="settleAmount">Amount (USD) *</label>
            <input
              id="settleAmount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="settleNotes">Payment Note (optional)</label>
            <input
              id="settleNotes"
              type="text"
              placeholder="e.g. Sent via UPI / Cash"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: '18px' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettleUpModal;
