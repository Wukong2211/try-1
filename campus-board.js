// Adds the SRM-only student marketplace and opportunity board to Campus.
// Payments and purchases are arranged directly by students; Borrowed does not process them.
(() => {
  const originalRender = window.renderCampusCommunity;
  const typeLabels = { item_sale: 'For sale', item_exchange: 'Exchange', giveaway: 'Free', deal: 'Campus deal', opportunity: 'Opportunity', missing_id: 'Missing ID card', found_id: 'Found ID card' };
  const boardTypes = {
    market: ['item_sale', 'item_exchange', 'giveaway'],
    opportunities: ['deal', 'opportunity'],
    'id-cards': ['missing_id', 'found_id']
  };
  let boardLoaded = false;
  let boardLoadPromise = null;
  const activeBoardTab = () => ['market', 'opportunities', 'id-cards'].includes(communityTab);
  const own = post => cloudMode && post.owner_id === cloud?.uid;

  function installTabs() {
    const tabs = document.querySelector('.community-tabs');
    if (!tabs) return;
    tabs.dataset.boardInstalled = 'true';
    const additions = [
      ['market', 'Student marketplace'],
      ['opportunities', 'Deals & opportunities'],
      ['id-cards', 'Lost & found IDs']
    ];
    additions.forEach(([tab, label]) => {
      if (!tabs.querySelector(`[data-community-tab="${tab}"]`)) {
        tabs.insertAdjacentHTML('beforeend', `<button class="tab" data-community-tab="${tab}">${label}</button>`);
      }
    });
    syncBoardTabs();
  }

  function syncBoardTabs() {
    const tabs = document.querySelector('.community-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('[data-community-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.communityTab === communityTab);
      button.setAttribute('aria-pressed', button.dataset.communityTab === communityTab ? 'true' : 'false');
    });
    const toolbar = document.querySelector('.community-toolbar span');
    const create = document.querySelector('#community-create');
    if (toolbar && create) {
      const copy = {
        skills: ['Short peer-learning sessions. Earn credits when both students confirm completion.', '＋ Offer a skill'],
        teams: ['Find collaborators for hackathons, competitions, and student projects.', '＋ Find teammates'],
        market: ['Buy, exchange, or give away useful things with verified SRM students. Coordinate and pay directly.', '＋ Create a listing'],
        opportunities: ['Find campus discounts, workshops, gigs, hackathons, and other student opportunities.', '＋ Post an opportunity'],
        'id-cards': ['Help return missing campus ID cards. Never post a card number, photo, QR code, or private details.', '＋ Post an ID card notice']
      }[communityTab];
      if (copy) { toolbar.textContent = copy[0]; create.textContent = copy[1]; }
    }
  }

  function renderBoard() {
    const content = document.querySelector('#community-content');
    if (!content || !activeBoardTab()) return;
    const allowed = boardTypes[communityTab];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const posts = (communityData.boardPosts || []).filter(p => allowed.includes(p.post_type) && (p.status === 'open' || own(p)) && (own(p) || !p.expires_at || p.expires_at >= today));
    const mine = posts.filter(own);
    const incoming = (communityData.boardInterests || []).filter(i => mine.some(p => p.id === i.post_id) && i.user_id !== cloud?.uid);
    const cards = posts.map(post => {
      const interest = (communityData.boardInterests || []).find(i => i.post_id === post.id && i.user_id === cloud?.uid);
      const others = incoming.filter(i => i.post_id === post.id);
      const date = post.expires_at ? ` · Closes ${new Date(`${post.expires_at}T12:00:00`).toLocaleDateString()}` : '';
      const price = post.post_type === 'item_sale' && post.price_rupees ? `<strong>₹${Number(post.price_rupees).toLocaleString('en-IN')}</strong>` : post.post_type === 'item_sale' ? '<span>Price by arrangement</span>' : '';
      const responseControls = others.map(i => `<div class="board-interest"><span>${esc(communityName(i.user_id))}: ${esc(i.introduction)}</span><span class="status-pill ${i.status === 'accepted' ? 'done' : ''}">${esc(i.status)}</span>${i.status === 'pending' ? `<button class="outline-button" data-board-answer="decline:${i.id}">Decline</button><button class="primary-button community-action" data-board-answer="accept:${i.id}">Accept</button>` : ''}${i.status === 'accepted' ? `<button class="outline-button" data-board-chat="${post.id}" data-board-with="${i.user_id}">Message</button>` : ''}</div>`).join('');
      const interestAction = communityTab === 'market' ? 'Contact student' : communityTab === 'id-cards' ? (post.post_type === 'missing_id' ? 'I found this card' : 'This is my card') : 'I’m interested';
      return `<article class="community-card board-card"><div class="community-card-top"><span class="community-tag">${esc(typeLabels[post.post_type] || 'Campus post')}</span><span class="community-format">${esc(post.category || 'Other')}${esc(date)}</span></div><h3>${esc(post.title)}</h3><p>${esc(post.description)}</p><div class="community-meta"><span>Posted by ${esc(communityName(post.owner_id))}</span>${price}</div>${responseControls ? `<div class="board-interests"><b>Responses</b>${responseControls}</div>` : ''}<div class="community-card-bottom">${own(post) ? `<span class="status-pill ${post.status === 'open' ? 'done' : ''}">${post.status === 'open' ? 'Live' : 'Closed'}</span><button class="outline-button" data-board-status="${post.id}">${post.status === 'open' ? 'Close post' : 'Reopen post'}</button><button class="outline-button" data-board-delete="${post.id}">Delete</button>` : interest ? `<span class="status-pill ${interest.status === 'accepted' ? 'done' : ''}">${interest.status === 'accepted' ? 'Accepted' : interest.status === 'declined' ? 'Declined' : 'Interest sent'}</span>${interest.status === 'accepted' ? `<button class="primary-button community-action" data-board-chat="${post.id}" data-board-with="${post.owner_id}">Message poster</button>` : ''}` : `<button class="primary-button community-action" data-board-interest="${post.id}">${interestAction}</button>`}</div></article>`;
    }).join('');
    const emptyCopy = communityTab === 'market'
      ? ['No marketplace posts yet', 'Post a useful item for sale, exchange, or giveaway.', 'Share something useful']
      : communityTab === 'id-cards'
        ? ['No ID card notices yet', 'Post a brief notice if you lost or found a campus ID card.', 'Post an ID card notice']
        : ['No deals or opportunities yet', 'Share a real campus deal, workshop, gig, or event.', 'Share a useful opportunity'];
    content.innerHTML = `<div class="community-grid">${cards || `<div class="empty-state"><b>${emptyCopy[0]}</b><p>${emptyCopy[1]}</p><button class="outline-button" data-board-open-create>${emptyCopy[2]}</button></div>`}</div><section class="help-card"><span class="eyebrow">CAMPUS COMMUNITY</span><h3>${communityTab === 'id-cards' ? 'Protect your identity' : 'Keep it clear and safe'}</h3><p>${communityTab === 'id-cards' ? 'Never post an ID number, card photo, QR/barcode, address, phone number, or other identifying details. Use a broad public campus location only; arrange return by private message and meet at campus security.' : 'Posts are student-submitted and not verified or endorsed by SRM or Borrowed. Meet in public campus areas. Any cash exchange is arranged directly between students; Borrowed does not process or protect payments. Never post private contact or room details.'}</p></section>`;
  }

  async function fetchBoard() {
    if (!cloudMode || !cloudUser) { communityData.boardPosts = []; communityData.boardInterests = []; return; }
    const [posts, ownInterests] = await Promise.all([
      cloud.select('campus_board_posts', 'select=*&order=created_at.desc'),
      cloud.select('campus_board_interests', `select=*&user_id=eq.${cloud.uid}&order=created_at.desc`)
    ]);
    const ownPostIds = posts.filter(own).map(p => p.id);
    const incoming = ownPostIds.length ? await cloud.select('campus_board_interests', `select=*&post_id=in.(${ownPostIds.join(',')})&order=created_at.desc`) : [];
    communityData.boardPosts = posts;
    communityData.boardInterests = [...new Map([...ownInterests, ...incoming].map(i => [i.id, i])).values()];
  }

  async function ensureBoardLoaded(force = false) {
    if (boardLoaded && !force) return;
    if (boardLoadPromise) return boardLoadPromise;
    boardLoadPromise = fetchBoard().then(() => { boardLoaded = true; }).finally(() => { boardLoadPromise = null; });
    return boardLoadPromise;
  }

  window.renderCampusCommunity = async function(...args) {
    // The community refresh timer and board actions should refresh data in place,
    // without rebuilding the Campus screen or showing its initial loading state.
    if (screen === 'community' && activeBoardTab() && document.querySelector('.community-tabs[data-board-installed]')) {
      try { await ensureBoardLoaded(true); renderBoard(); }
      catch (error) { showToast('Could not refresh campus posts. Try again shortly.'); }
      return;
    }
    await originalRender.apply(this, args);
    if (screen !== 'community') return;
    installTabs();
    if (activeBoardTab()) {
      try { await ensureBoardLoaded(true); renderBoard(); }
      catch (error) {
        const content = document.querySelector('#community-content');
        if (content) content.innerHTML = `<div class="empty-state"><b>Campus marketplace is not set up yet</b><p>${esc(error.message || 'Check your connection.')}</p><p>Run <code>supabase-campus-market.sql</code> in Supabase SQL Editor, then reload this page.</p><button class="outline-button" data-community-retry>Try again</button></div>`;
      }
    }
  };

  function openPostDialog() {
    if (!cloudMode || !cloudUser) { communityOpenAuth(); return; }
    const type = document.querySelector('#campus-post-type');
    type.value = communityTab === 'market' ? 'item_sale' : communityTab === 'id-cards' ? 'missing_id' : 'opportunity';
    document.querySelector('#campus-post-heading').textContent = communityTab === 'market' ? 'Create a marketplace post' : communityTab === 'id-cards' ? 'Post a lost or found ID card notice' : 'Post a deal or opportunity';
    document.querySelector('#campus-price-wrap').hidden = type.value !== 'item_sale';
    document.querySelector('#campus-id-card-safety').hidden = !['missing_id', 'found_id'].includes(type.value);
    document.querySelector('#campus-post-title').placeholder = communityTab === 'id-cards' ? 'e.g. Lost campus ID near the library' : 'e.g. Engineering mathematics textbook';
    document.querySelector('#campus-post-description').placeholder = communityTab === 'id-cards' ? 'Share only a broad location and when it was lost or found. Do not include an ID number or identifying details.' : 'Condition, exchange preference, deal terms, or opportunity details';
    document.querySelector('#campus-post-dialog').showModal();
  }
  document.querySelector('#campus-post-type').addEventListener('change', e => {
    document.querySelector('#campus-price-wrap').hidden = e.target.value !== 'item_sale';
    document.querySelector('#campus-id-card-safety').hidden = !['missing_id', 'found_id'].includes(e.target.value);
    document.querySelector('#campus-post-heading').textContent = ['missing_id', 'found_id'].includes(e.target.value) ? 'Post a lost or found ID card notice' : e.target.value === 'item_sale' ? 'Create a marketplace post' : 'Post a deal or opportunity';
  });
  document.querySelector('#campus-post-type').insertAdjacentHTML('beforeend', '<option value="missing_id">Report a missing ID card</option><option value="found_id">Report a found ID card</option>');
  const idCardSafety = document.createElement('p');
  idCardSafety.id = 'campus-id-card-safety';
  idCardSafety.className = 'campus-post-disclosure';
  idCardSafety.hidden = true;
  idCardSafety.textContent = 'Protect your identity: never post an ID number, card photo, QR/barcode, address, phone number, or other identifying details. Share only a broad public campus location. Arrange return by private message and meet at campus security.';
  document.querySelector('#campus-post-description').insertAdjacentElement('afterend', idCardSafety);

  document.addEventListener('click', async event => {
    const campusTab = event.target.closest('[data-community-tab]');
    if (campusTab && ['skills', 'teams', 'market', 'opportunities', 'id-cards'].includes(campusTab.dataset.communityTab)) {
      event.preventDefault(); event.stopImmediatePropagation();
      communityTab = campusTab.dataset.communityTab;
      syncBoardTabs();
      const content = document.querySelector('#community-content');
      if (!activeBoardTab()) { drawCommunity(); return; }
      if (boardLoaded) { renderBoard(); return; }
      if (content) content.innerHTML = '<div class="empty-state board-loading"><span class="board-spinner" aria-hidden="true"></span><b>Loading campus posts…</b></div>';
      try { await ensureBoardLoaded(); renderBoard(); }
      catch (error) {
        if (content) content.innerHTML = `<div class="empty-state"><b>Campus marketplace is not set up yet</b><p>${esc(error.message || 'Check your connection.')}</p><p>Run <code>supabase-campus-market.sql</code> in Supabase SQL Editor, then reload this page.</p><button class="outline-button" data-community-retry>Try again</button></div>`;
      }
      return;
    }
    const create = event.target.closest('#community-create,[data-board-open-create]');
    if (create && activeBoardTab()) { event.preventDefault(); event.stopImmediatePropagation(); openPostDialog(); return; }
    const interestButton = event.target.closest('[data-board-interest]');
    if (interestButton) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!cloudMode || !cloudUser) { communityOpenAuth(); return; }
      const post = communityData.boardPosts.find(p => p.id === interestButton.dataset.boardInterest);
      document.querySelector('#board-interest-title').textContent = post?.title || 'Campus post';
      document.querySelector('#board-interest-dialog').dataset.postId = interestButton.dataset.boardInterest;
      document.querySelector('#board-introduction').value = '';
      document.querySelector('#board-interest-dialog').showModal(); return;
    }
    const answer = event.target.closest('[data-board-answer]');
    if (answer) {
      event.preventDefault(); event.stopImmediatePropagation();
      const [action, id] = answer.dataset.boardAnswer.split(':');
      try { await cloud.rpc('respond_campus_board_interest', {p_interest_id:id,p_accept:action === 'accept'}); await window.renderCampusCommunity(); showToast(action === 'accept' ? 'Accepted. Messaging is now available.' : 'Interest declined.'); }
      catch (error) { showToast(error.message); }
      return;
    }
    const status = event.target.closest('[data-board-status]');
    if (status) {
      event.preventDefault(); event.stopImmediatePropagation();
      const post = communityData.boardPosts.find(p => p.id === status.dataset.boardStatus);
      try { await cloud.update('campus_board_posts', `id=eq.${post.id}&owner_id=eq.${cloud.uid}`, {status:post.status === 'open' ? 'closed' : 'open'}); await window.renderCampusCommunity(); }
      catch (error) { showToast(error.message); }
      return;
    }
    const remove = event.target.closest('[data-board-delete]');
    if (remove) {
      event.preventDefault(); event.stopImmediatePropagation();
      const post = communityData.boardPosts.find(p => p.id === remove.dataset.boardDelete);
      if (!post || !confirm(`Permanently delete “${post.title}” and its responses?`)) return;
      try { await cloud.remove('campus_board_posts', `id=eq.${post.id}&owner_id=eq.${cloud.uid}`); await window.renderCampusCommunity(); showToast('Post deleted.'); }
      catch (error) { showToast(error.message); }
      return;
    }
    const chat = event.target.closest('[data-board-chat]');
    if (chat) {
      event.preventDefault(); event.stopImmediatePropagation();
      const post = communityData.boardPosts.find(p => p.id === chat.dataset.boardChat);
      activeTeamChat = {kind:'board',id:post.id,with:chat.dataset.boardWith};
      document.querySelector('#community-chat-title').textContent = `Chat · ${post.title}`;
      document.querySelector('#community-chat-dialog').showModal();
      await refreshCommunityChat(); clearInterval(teamChatTimer);
      teamChatTimer = setInterval(() => { if (document.querySelector('#community-chat-dialog').open) refreshCommunityChat().catch(() => {}); }, 5000);
    }
  }, true);

  document.addEventListener('submit', async event => {
    if (event.target.id === 'campus-post-dialog-form') {
      event.preventDefault();
      if (!cloudMode || !cloudUser) { communityOpenAuth(); return; }
      const postType = document.querySelector('#campus-post-type').value;
      const title = document.querySelector('#campus-post-title').value.trim();
      const description = document.querySelector('#campus-post-description').value.trim();
      if (title.length < 3 || description.length < 5) { showToast('Add a title and a few details before posting.'); return; }
      const price = document.querySelector('#campus-post-price').value;
      try {
        await cloud.insert('campus_board_posts', {owner_id:cloud.uid,post_type:postType,title,description,category:document.querySelector('#campus-post-category').value.trim() || 'Other',price_rupees:postType === 'item_sale' && price ? Number(price) : null,expires_at:document.querySelector('#campus-post-expires').value || null,status:'open'});
        document.querySelector('#campus-post-dialog').close(); event.target.reset();
        await window.renderCampusCommunity(); showToast('Your post is live for SRM students.');
      } catch (error) { showToast(error.message); }
      return;
    }
    if (event.target.id === 'board-interest-form') {
      event.preventDefault();
      const intro = document.querySelector('#board-introduction').value.trim();
      if (intro.length < 5) { showToast('Add a short message (at least 5 characters).'); return; }
      try {
        await cloud.insert('campus_board_interests', {post_id:document.querySelector('#board-interest-dialog').dataset.postId,user_id:cloud.uid,introduction:intro});
        document.querySelector('#board-interest-dialog').close(); await window.renderCampusCommunity(); showToast('Your message was sent to the poster.');
      } catch (error) { showToast(error.message); }
      return;
    }
    if (event.target.id === 'community-chat-form' && activeTeamChat?.kind === 'board') {
      event.preventDefault(); event.stopImmediatePropagation();
      const input = document.querySelector('#community-chat-input'), body = input.value.trim();
      if (!body) return;
      try { await cloud.insert('campus_board_messages', {post_id:activeTeamChat.id,sender_id:cloud.uid,recipient_id:activeTeamChat.with,body}); input.value = ''; await refreshCommunityChat(); }
      catch (error) { showToast(error.message); }
    }
  }, true);

  const originalRefreshChat = refreshCommunityChat;
  refreshCommunityChat = async function(...args) {
    if (activeTeamChat?.kind !== 'board') return originalRefreshChat.apply(this, args);
    if (!cloudMode || !cloudUser) return;
    const uid = cloud.uid, peer = activeTeamChat.with;
    const messages = await cloud.select('campus_board_messages', `select=*&post_id=eq.${activeTeamChat.id}&or=(and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid}))&order=created_at.asc`);
    const box = document.querySelector('#community-chat-messages');
    box.innerHTML = messages.map(m => `<div class="chat-message ${m.sender_id === cloud.uid ? 'mine' : ''}"><p>${esc(m.body)}</p><small>${new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></div>`).join('') || '<div class="chat-empty">Start a conversation to coordinate.</div>';
    box.scrollTop = box.scrollHeight;
  };
})();
