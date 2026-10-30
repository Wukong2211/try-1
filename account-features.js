(() => {
  const authEmail = document.querySelector('#auth-email');
  const authSubmit = document.querySelector('#auth-submit');
  const authSwitch = document.querySelector('#auth-switch');
  const authModeLabel = document.querySelector('#auth-title');
  const forgotButton = document.querySelector('#auth-forgot');

  forgotButton.hidden = authMode !== 'signin';
  authSwitch.addEventListener('click', () => {
    forgotButton.hidden = authMode !== 'signin';
  });

  const resetDialog = document.createElement('dialog');
  resetDialog.className = 'modal auth-modal';
  resetDialog.innerHTML = `<form method="dialog"><button class="close" aria-label="Close">×</button></form>
    <span class="brand-auth">borrowed<span>.</span></span>
    <h2>Reset your password</h2>
    <p class="modal-sub">We’ll email a secure reset link to your SRM account.</p>
    <label class="field-label" for="reset-email">SRM email</label>
    <input id="reset-email" class="field" type="email" autocomplete="email" placeholder="you@srmist.edu.in">
    <button type="button" class="primary-button" id="send-reset-link">Send reset link <span>↗</span></button>
    <p class="form-feedback" id="reset-feedback" role="status" aria-live="polite"></p>`;
  document.body.append(resetDialog);

  forgotButton.addEventListener('click', () => {
    document.querySelector('#reset-email').value = authEmail.value.trim();
    document.querySelector('#reset-feedback').textContent = '';
    resetDialog.showModal();
  });

  document.querySelector('#send-reset-link').addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = document.querySelector('#reset-feedback');
    const email = document.querySelector('#reset-email').value.trim();
    if (!isSrmEmail(email)) {
      status.textContent = 'Enter your SRM email ending in @srmist.edu.in.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      await cloud.requestPasswordReset(email);
      status.textContent = 'If an account exists for this address, a reset link has been sent. Check your inbox and spam folder.';
    } catch (error) {
      status.textContent = error?.message || 'Could not send the reset email. Please try again.';
    } finally {
      button.disabled = false;
      button.innerHTML = 'Send reset link <span>↗</span>';
    }
  });

  const recoveryDialog = document.createElement('dialog');
  recoveryDialog.className = 'modal auth-modal';
  recoveryDialog.innerHTML = `<span class="brand-auth">borrowed<span>.</span></span>
    <h2>Choose a new password</h2>
    <p class="modal-sub">Use at least 8 characters for your new password.</p>
    <label class="field-label" for="new-password">New password</label>
    <input id="new-password" class="field" type="password" autocomplete="new-password" minlength="8">
    <label class="field-label" for="confirm-password">Confirm new password</label>
    <input id="confirm-password" class="field" type="password" autocomplete="new-password" minlength="8">
    <button type="button" class="primary-button" id="save-new-password">Save new password <span>↗</span></button>
    <p class="form-feedback" id="password-feedback" role="status" aria-live="polite"></p>`;
  document.body.append(recoveryDialog);

  if (cloud.passwordRecoveryPending) recoveryDialog.showModal();

  document.querySelector('#save-new-password').addEventListener('click', async event => {
    const button = event.currentTarget;
    const status = document.querySelector('#password-feedback');
    const password = document.querySelector('#new-password').value;
    const confirmation = document.querySelector('#confirm-password').value;
    if (password.length < 8) {
      status.textContent = 'Use at least 8 characters.';
      return;
    }
    if (password !== confirmation) {
      status.textContent = 'The passwords do not match.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Updating…';
    try {
      await cloud.updatePassword(password);
      cloud.clearPasswordRecovery();
      recoveryDialog.close();
      showToast('Password updated successfully.');
    } catch (error) {
      status.textContent = error?.message || 'Could not update the password. Request a new reset link and try again.';
    } finally {
      button.disabled = false;
      button.innerHTML = 'Save new password <span>↗</span>';
    }
  });

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-item]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = state.items.find(entry => String(entry.id) === button.dataset.deleteItem);
    if (!item?.mine) {
      showToast('You can delete only your own listings.');
      return;
    }
    if (state.transactions.some(transaction => String(transaction.itemId) === String(item.id))) {
      showToast('This listing has borrowing history, so it cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
    button.disabled = true;
    button.textContent = 'Deleting…';
    try {
      if (cloudMode) {
        if (!cloudUser) throw new Error('Sign in again to delete this listing.');
        await cloud.remove('items', `id=eq.${encodeURIComponent(item.id)}`);
        await cloudLoad();
      } else {
        state.items = state.items.filter(entry => String(entry.id) !== String(item.id));
        persist();
        render();
      }
      document.querySelector('#item-dialog').close();
      showToast('Listing deleted.');
    } catch (error) {
      showToast(error?.message || 'Could not delete the listing. Please try again.');
      button.disabled = false;
      button.textContent = 'Delete listing';
    }
  }, true);
})();
