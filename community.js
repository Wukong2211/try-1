let communityTab='skills';
let communityLoadedAt=0;
let communityData={offers:[],sessions:[],teams:[],interests:[],profiles:[]};
let selectedSkillOffer=null,selectedTeamPost=null,activeTeamChat=null,teamChatTimer=null;
const communityName=id=>communityData.profiles.find(p=>p.id===id)?.display_name||'SRM student';
const communityOpenAuth=()=>{if(window.authDialog){authMessage.textContent='Sign in with your @srmist.edu.in email to use campus community features.';authDialog.showModal()}else showToast('Sign in with your SRM email to continue.')};
async function loadCommunity(){
 if(!cloudMode||!cloudUser){communityData.offers=state.communityOffers||[];communityData.sessions=state.communitySessions||[];communityData.teams=state.communityTeams||[];communityData.interests=state.communityInterests||[];communityData.profiles=[];communityLoadedAt=Date.now();return}
 const uid=cloud.uid;
 const [offers,teams,profiles,ownInterests]=await Promise.all([
  cloud.select('skill_offers','select=*&order=created_at.desc'),
  cloud.select('team_posts','select=*&order=created_at.desc'),
  cloud.select('profiles','select=id,display_name'),
  cloud.select('team_interests',`select=*&user_id=eq.${uid}&order=created_at.desc`)
 ]);
 const ownTeamIds=teams.filter(p=>p.owner_id===uid).map(p=>p.id);
 const incoming=ownTeamIds.length?await cloud.select('team_interests',`select=*&post_id=in.(${ownTeamIds.join(',')})&order=created_at.desc`):[];
 const ownOfferIds=offers.filter(o=>o.owner_id===uid).map(o=>o.id);
 const sessionFilter=ownOfferIds.length?`select=*&or=(requester_id.eq.${uid},offer_id.in.(${ownOfferIds.join(',')}))&order=created_at.desc`:`select=*&requester_id=eq.${uid}&order=created_at.desc`;
 communityData={offers,sessions:await cloud.select('skill_sessions',sessionFilter),teams,interests:[...new Map([...ownInterests,...incoming].map(i=>[i.id,i])).values()],profiles};communityLoadedAt=Date.now();
}
let campusNotificationRefreshPromise=null,campusNotificationRefreshedAt=0;
const knownCampusNotificationIds=new Map();
window.campusNotificationItems=[];
async function loadSkillRequestNotifications(){
 const offers=await cloud.select('skill_offers',`select=id,title&owner_id=eq.${cloud.uid}`);
 if(!offers.length)return [];
 const sessions=await cloud.select('skill_sessions',`select=id,offer_id,created_at&offer_id=in.(${offers.map(o=>o.id).join(',')})&status=eq.pending&order=created_at.desc`);
 return sessions.map(session=>({id:`skill:${session.id}`,domain:'skills',tab:'skills',title:'New request for your skill',body:offers.find(o=>o.id===session.offer_id)?.title||'Skill session',createdAt:session.created_at}));
}
async function loadTeamRequestNotifications(){
 const posts=await cloud.select('team_posts',`select=id,title&owner_id=eq.${cloud.uid}`);
 if(!posts.length)return [];
 const interests=await cloud.select('team_interests',`select=id,post_id,created_at&post_id=in.(${posts.map(p=>p.id).join(',')})&status=eq.pending&order=created_at.desc`);
 return interests.map(interest=>({id:`team:${interest.id}`,domain:'teams',tab:'teams',title:'New introduction for your team post',body:posts.find(p=>p.id===interest.post_id)?.title||'Team post',createdAt:interest.created_at}));
}
async function loadBoardRequestNotifications(){
 const posts=await cloud.select('campus_board_posts',`select=id,title,post_type&owner_id=eq.${cloud.uid}`);
 if(!posts.length)return [];
 const interests=await cloud.select('campus_board_interests',`select=id,post_id,created_at&post_id=in.(${posts.map(p=>p.id).join(',')})&status=eq.pending&order=created_at.desc`);
 return interests.map(interest=>{
  const post=posts.find(p=>p.id===interest.post_id);
  const idCard=['missing_id','found_id'].includes(post?.post_type);
  return {id:`board:${interest.id}`,domain:'board',tab:idCard?'id-cards':['deal','opportunity'].includes(post?.post_type)?'opportunities':'market',title:idCard?'New response to your ID card notice':'New interest in your campus post',body:post?.title||'Campus post',createdAt:interest.created_at};
 });
}
function syncCampusNotificationUi(){
 const items=window.campusNotificationItems||[];
 const badge=document.querySelector('#notification-count');
 if(badge){
  const count=state.transactions.filter(transaction=>transaction.status==='Pending').length+items.length;
  badge.hidden=!count;
  badge.textContent=count>9?'9+':String(count);
 }
 if(screen!=='notifications')return;
 app.querySelector('[data-campus-notification-list]')?.remove();
 const list=app.querySelector('.activity-list');
 if(!list||!items.length)return;
 const cards=items.map(item=>`<article class="activity-card campus-notification-card"><div class="activity-emoji">✧</div><div class="activity-main"><b>${esc(item.title)}</b><p>${esc(item.body)}</p><small>${new Date(item.createdAt).toLocaleString()}</small></div><span class="status-pill">Action needed</span><button class="outline-button" data-campus-notification="${esc(item.id)}" data-campus-tab="${esc(item.tab)}">Review in Campus</button></article>`).join('');
 list.insertAdjacentHTML('beforebegin',`<div data-campus-notification-list>${heading('CAMPUS COMMUNITY','Requests for your posts')}<section class="activity-list">${cards}</section></div>`);
}
async function refreshCampusNotifications(){
 if(!cloudMode||!cloudUser){window.campusNotificationItems=[];knownCampusNotificationIds.clear();syncCampusNotificationUi();return []}
 if(campusNotificationRefreshPromise)return campusNotificationRefreshPromise;
 if(Date.now()-campusNotificationRefreshedAt<10000)return window.campusNotificationItems;
 campusNotificationRefreshPromise=(async()=>{
  const domains=[
   ['skills',loadSkillRequestNotifications],
   ['teams',loadTeamRequestNotifications],
   ['board',loadBoardRequestNotifications]
  ];
  const results=await Promise.all(domains.map(async([domain,load])=>{
   try{return {domain,items:await load()}}
   catch(error){console.warn(`Could not refresh ${domain} notifications:`,error);return {domain,items:null}}
  }));
  const itemsByDomain=new Map(results.map(result=>[result.domain,result.items]));
  const previousItems=window.campusNotificationItems||[];
  const nextItems=[];
  for(const [domain,items] of itemsByDomain){
   if(items===null){nextItems.push(...previousItems.filter(item=>item.domain===domain));continue}
   const known=knownCampusNotificationIds.get(domain);
   if(known){
    const added=items.find(item=>!known.has(item.id));
    if(added)showToast(`${added.title}: ${added.body}.`);
   }
   knownCampusNotificationIds.set(domain,new Set(items.map(item=>item.id)));
   nextItems.push(...items);
  }
  window.campusNotificationItems=nextItems.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  campusNotificationRefreshedAt=Date.now();
  syncCampusNotificationUi();
  return window.campusNotificationItems;
 })().finally(()=>{campusNotificationRefreshPromise=null});
 return campusNotificationRefreshPromise;
}
window.refreshCampusNotifications=refreshCampusNotifications;
const originalAppRender=window.render;
window.render=function(...args){
 const result=originalAppRender.apply(this,args);
 syncCampusNotificationUi();
 if(cloudMode&&cloudUser)refreshCampusNotifications().catch(error=>console.warn('Campus notification refresh failed:',error));
 return result;
};
document.addEventListener('click',event=>{
 const notification=event.target.closest('[data-campus-notification]');
 if(!notification)return;
 communityTab=notification.dataset.campusTab;
 go('community');
},true);
function skillOfferCard(o){const own=cloudMode&&o.owner_id===cloud.uid;const session=communityData.sessions.find(s=>s.offer_id===o.id&&s.requester_id===cloud?.uid&&['pending','approved'].includes(s.status));return `<article class="community-card"><div class="community-card-top"><span class="community-tag">${esc(o.category)}</span><span class="community-format">${esc(o.format)}</span></div><h3>${esc(o.title)}</h3><p>${esc(o.details||'A student is offering to share this skill.')}</p><div class="community-meta"><span>By ${esc(communityName(o.owner_id))}</span><span>${esc(o.availability||'Time by arrangement')}</span></div><div class="community-card-bottom"><strong>✦ ${o.credit_cost} credit${o.credit_cost===1?'':'s'} / session</strong>${own?`<button class="outline-button" data-pause-skill="${o.id}">${o.status==='open'?'Pause offer':'Reopen offer'}</button>`:session?`<span class="status-pill ${session.status==='completed'?'done':''}">${session.status}</span>`:`<button class="primary-button community-action" data-request-skill="${o.id}">Request session</button>`}</div></article>`}
function teamPostCard(p){const own=cloudMode&&p.owner_id===cloud.uid;const interest=communityData.interests.find(i=>i.post_id===p.id&&i.user_id===cloud?.uid);const interested=communityData.interests.filter(i=>i.post_id===p.id);const skills=Array.isArray(p.skills)?p.skills:[];return `<article class="community-card team-card"><div class="community-card-top"><span class="community-tag">${esc(p.event_name)}</span><span class="community-format">${esc(p.format)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description||'Details to be discussed with teammates.')}</p>${skills.length?`<div class="skill-chips">${skills.map(s=>`<span>${esc(s)}</span>`).join('')}</div>`:''}<div class="community-meta"><span>Organized by ${esc(communityName(p.owner_id))}</span><span>${interested.length} interested</span></div><div class="community-card-bottom">${own?`<button class="outline-button" data-close-team="${p.id}">${p.status==='open'?'Close team search':'Reopen team search'}</button>`:interest?`<span class="status-pill ${interest.status==='accepted'?'done':''}">${interest.status==='accepted'?'Accepted':interest.status==='declined'?'Not selected':'Introduction sent'}</span>${interest.status==='accepted'?`<button class="primary-button community-action" data-team-chat="${p.id}">Open team chat</button>`:''}`:`<button class="primary-button community-action" data-join-team="${p.id}">Introduce yourself</button>`}</div></article>`}
function sessionCard(s){const offer=communityData.offers.find(o=>o.id===s.offer_id)||{};const ownOffer=cloudMode&&offer.owner_id===cloud.uid;return `<article class="community-card session-card"><div><span class="community-tag">${s.status==='pending'?'Needs a response':'Your session'}</span><h3>${esc(offer.title||'Skill session')}</h3><p>${ownOffer?`Requested by ${esc(communityName(s.requester_id))}`:`With ${esc(communityName(offer.owner_id))}`}${s.note?` · “${esc(s.note)}”`:''}</p></div><div class="community-card-bottom"><span class="status-pill ${s.status==='completed'?'done':''}">${s.status}</span><div>${s.status==='pending'&&ownOffer?`<button class="outline-button" data-skill-answer="decline:${s.id}">Decline</button><button class="primary-button community-action" data-skill-answer="accept:${s.id}">Approve · ${offer.credit_cost||1} credit</button>`:''}${s.status==='approved'?`<button class="primary-button community-action" data-skill-confirm="${s.id}">Confirm session complete</button><button class="outline-button" data-skill-chat="${s.id}">Message</button>`:''}</div></div></article>`}
window.renderCampusCommunity=async function(){
 app.dataset.friendsBoard=communityTab;
 const campusCopy={skills:['Skills, projects & teammates','Share what you know, learn from another student, or find a team for your next idea.','Short peer-learning sessions. Earn credits when both students confirm completion.','＋ Offer a skill'],teams:['Skills, projects & teammates','Share what you know, learn from another student, or find a team for your next idea.','Find collaborators for hackathons, competitions, and student projects.','＋ Find teammates'],market:['Student marketplace','Buy, exchange, or give away items with other students.','Buy, exchange, or give away useful things with verified SRM students. Coordinate and pay directly.','＋ Create a listing'],opportunities:['Deals & opportunities','Discover campus deals, workshops, gigs, and events.','Find campus discounts, workshops, gigs, hackathons, and other student opportunities.','＋ Post an opportunity'],'id-cards':['Lost & found ID cards','Report a lost or found campus ID card without exposing personal details.','Help return missing campus ID cards. Never post a card number, photo, QR code, or private details.','＋ Post an ID card notice']}[communityTab]||['Campus Community','Share what you know, learn from another student, or find a team for your next idea.','Share what you know, learn from another student, or find a team for your next idea.','＋ Explore Campus'];
 app.innerHTML=`${heading('SRM CAMPUS COMMUNITY',campusCopy[0])}<p class="page-sub">${campusCopy[1]}</p><div class="community-tabs"><button class="tab ${communityTab==='skills'?'active':''}" data-community-tab="skills">Skills & help</button><button class="tab ${communityTab==='teams'?'active':''}" data-community-tab="teams">Find teammates</button></div><div class="community-toolbar"><span>${campusCopy[2]}</span><button class="primary-button community-action" id="community-create">${campusCopy[3]}</button></div><div class="community-content" id="community-content"><div class="empty-state">Loading campus posts…</div></div>`;
 if(communityLoadedAt)drawCommunity();
 try{await loadCommunity();if(screen!=='community')return;drawCommunity()}catch(err){console.error('Campus community:',err);if(communityLoadedAt){drawCommunity();showToast('Could not refresh campus posts. Showing the last loaded results.')}else document.querySelector('#community-content').innerHTML=`<div class="empty-state"><b>Couldn’t load the campus board</b><p>${esc(err.message||'Check your connection and the community database setup.')}</p><p>If this is the first launch, run supabase-campus-community.sql in your Supabase SQL Editor.</p><button class="outline-button" data-community-retry>Try again</button></div>`}
};
function drawCommunity(){const content=document.querySelector('#community-content');if(!content)return;const ownSessions=communityData.sessions.filter(s=>{const o=communityData.offers.find(x=>x.id===s.offer_id);return s.requester_id===cloud?.uid||o?.owner_id===cloud?.uid});const openOffers=communityData.offers.filter(o=>o.status==='open');const openTeams=communityData.teams.filter(t=>t.status==='open');if(communityTab==='skills'){content.innerHTML=`${ownSessions.length?`${heading('YOUR LEARNING','Session requests')}<div class="community-grid">${ownSessions.map(sessionCard).join('')}</div>`:''}${heading('LEARN FROM STUDENTS','Skills offered on campus')}<div class="community-grid">${openOffers.length?openOffers.map(skillOfferCard).join(''):'<div class="empty-state"><b>No skill offers yet</b><p>Post the first offer—tutoring, software help, design, electronics, languages, and more.</p></div>'}</div><section class="help-card"><span class="eyebrow">FAIR & SAFE EXCHANGE</span><h3>Teach the skill, don’t do the graded work</h3><p>Keep sessions short and focused. Meet publicly for in-person sessions. Credits are charged only after the offer owner approves, and paid to the helper after both students confirm the session.</p></section>`}else{const incoming=communityData.interests.filter(i=>communityData.teams.some(p=>p.id===i.post_id&&p.owner_id===cloud?.uid));content.innerHTML=`${incoming.length?`${heading('YOUR TEAM POSTS','Student introductions')}<div class="community-grid">${incoming.map(i=>{const p=communityData.teams.find(x=>x.id===i.post_id)||{};return `<article class="community-card"><span class="community-tag">${esc(p.event_name||'Project')}</span><h3>${esc(communityName(i.user_id))}</h3><p>${esc(i.introduction)}</p><div class="community-card-bottom"><span class="status-pill ${i.status==='accepted'?'done':''}">${i.status}</span>${i.status==='pending'?`<div><button class="outline-button" data-team-answer="decline:${i.id}">Decline</button><button class="primary-button community-action" data-team-answer="accept:${i.id}">Accept</button></div>`:''}${i.status==='accepted'?`<button class="primary-button community-action" data-team-chat="${p.id}">Message teammate</button>`:''}</div></article>`}).join('')}</div>`:''}${heading('CAMPUS TEAM BOARD','Find your next teammate')}<div class="community-grid">${openTeams.length?openTeams.map(teamPostCard).join(''):'<div class="empty-state"><b>No teams recruiting right now</b><p>Post what you’re building and the skills you need.</p></div>'}</div><section class="help-card"><span class="eyebrow">GOOD TEAM MATCHES START CLEAR</span><h3>Set expectations upfront</h3><p>Say what you’re building, the skills you need, the event deadline, and how much time you expect teammates to contribute.</p></section>`}}
document.addEventListener('click',async e=>{const tab=e.target.closest('[data-community-tab]');if(tab){communityTab=tab.dataset.communityTab;if(document.body.dataset.theme==='central-perk')window.showFriendsEpisode?.(`community-${communityTab}`);window.renderCampusCommunity();window.refreshFriendsPagePal?.();return}const create=e.target.closest('#community-create');if(create){if(!cloudMode||!cloudUser){communityOpenAuth();return}document.querySelector(communityTab==='skills'?'#skill-offer-dialog':'#team-post-dialog').showModal();return}const pause=e.target.closest('[data-pause-skill]');if(pause){try{if(cloudMode)await cloud.update('skill_offers',`id=eq.${pause.dataset.pauseSkill}&owner_id=eq.${cloud.uid}`,{status:communityData.offers.find(o=>o.id===pause.dataset.pauseSkill)?.status==='open'?'paused':'open'});else{const o=communityData.offers.find(o=>o.id===pause.dataset.pauseSkill);o.status=o.status==='open'?'paused':'open';state.communityOffers=communityData.offers;persist()}await window.renderCampusCommunity()}catch(err){showToast(err.message)}return}const request=e.target.closest('[data-request-skill]');if(request){if(!cloudMode||!cloudUser){communityOpenAuth();return}selectedSkillOffer=request.dataset.requestSkill;const offer=communityData.offers.find(o=>o.id===selectedSkillOffer);document.querySelector('#skill-request-title').textContent=offer.title;document.querySelector('#skill-request-cost').textContent=`${offer.credit_cost} credit${offer.credit_cost===1?'':'s'} · ${offer.format} · ${offer.availability||'schedule with the student'}`;document.querySelector('#skill-request-dialog').showModal();return}const answer=e.target.closest('[data-skill-answer]');if(answer){const [action,id]=answer.dataset.skillAnswer.split(':');try{await cloud.rpc('respond_skill_session',{p_session_id:id,p_accept:action==='accept'});await window.renderCampusCommunity();showToast(action==='accept'?'Session approved. Credits are held until both confirm completion.':'Request declined.')}catch(err){showToast(err.message)}return}const confirm=e.target.closest('[data-skill-confirm]');if(confirm){try{const result=await cloud.rpc('confirm_skill_session',{p_session_id:confirm.dataset.skillConfirm});await cloudLoad();await window.renderCampusCommunity();showToast(result==='completed'?'Session complete. Credits sent to the helper.':'Waiting for the other student to confirm.')}catch(err){showToast(err.message)}return}
 const publishSkill=e.target.closest('#publish-skill');if(publishSkill){e.preventDefault();if(!cloudMode||!cloudUser){communityOpenAuth();return}const title=document.querySelector('#skill-title').value.trim();if(title.length<3){showToast('Describe the skill in at least 3 characters.');return}try{await cloud.insert('skill_offers',{owner_id:cloud.uid,title,category:document.querySelector('#skill-category').value,details:document.querySelector('#skill-details').value.trim(),format:document.querySelector('#skill-format').value,availability:document.querySelector('#skill-availability').value.trim(),credit_cost:+document.querySelector('#skill-cost').value,status:'open'});document.querySelector('#skill-offer-dialog').close();['#skill-title','#skill-details','#skill-availability'].forEach(id=>document.querySelector(id).value='');document.querySelector('#skill-category').value='Study';document.querySelector('#skill-format').value='Either';document.querySelector('#skill-cost').value='1';await window.renderCampusCommunity();window.friendsCampusMoment?.('skill');showToast('Your skill offer is live.')}catch(err){showToast(err.message)}return}
 const sendSession=e.target.closest('#send-skill-request');if(sendSession){e.preventDefault();if(!selectedSkillOffer)return;try{await cloud.rpc('create_skill_session',{p_offer_id:selectedSkillOffer,p_note:document.querySelector('#skill-request-note').value.trim()});document.querySelector('#skill-request-dialog').close();document.querySelector('#skill-request-note').value='';await window.renderCampusCommunity();showToast('Request sent. The student can approve it from Campus.')}catch(err){showToast(err.message)}return}
 const publishTeam=e.target.closest('#publish-team');if(publishTeam){e.preventDefault();if(!cloudMode||!cloudUser){communityOpenAuth();return}const event_name=document.querySelector('#team-event').value.trim(),title=document.querySelector('#team-title').value.trim();if(event_name.length<2||title.length<3){showToast('Add the event and the role you’re looking for.');return}try{await cloud.insert('team_posts',{owner_id:cloud.uid,event_name,title,description:document.querySelector('#team-description').value.trim(),skills:document.querySelector('#team-skills').value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,10),format:document.querySelector('#team-format').value,status:'open'});document.querySelector('#team-post-dialog').close();['#team-event','#team-title','#team-description','#team-skills'].forEach(id=>document.querySelector(id).value='');document.querySelector('#team-format').value='Either';await window.renderCampusCommunity();showToast('Your team search is posted.')}catch(err){showToast(err.message)}return}
 const join=e.target.closest('[data-join-team]');if(join){if(!cloudMode||!cloudUser){communityOpenAuth();return}selectedTeamPost=join.dataset.joinTeam;document.querySelector('#team-interest-title').textContent=communityData.teams.find(p=>p.id===selectedTeamPost)?.title||'';document.querySelector('#team-interest-dialog').showModal();return}const sendInterest=e.target.closest('#send-team-interest');if(sendInterest){e.preventDefault();const introduction=document.querySelector('#team-introduction').value.trim();if(introduction.length<5){showToast('Write at least a short introduction.');return}try{await cloud.insert('team_interests',{post_id:selectedTeamPost,user_id:cloud.uid,introduction});document.querySelector('#team-interest-dialog').close();document.querySelector('#team-introduction').value='';await window.renderCampusCommunity();showToast('Introduction sent to the organizer.')}catch(err){showToast(err.message)}return}
 const answerTeam=e.target.closest('[data-team-answer]');if(answerTeam){const [action,id]=answerTeam.dataset.teamAnswer.split(':');try{await cloud.rpc('respond_team_interest',{p_interest_id:id,p_accept:action==='accept'});await window.renderCampusCommunity();showToast(action==='accept'?'Teammate accepted. You can now message them here.':'Introduction declined.')}catch(err){showToast(err.message)}return}const closeTeam=e.target.closest('[data-close-team]');if(closeTeam){const post=communityData.teams.find(p=>p.id===closeTeam.dataset.closeTeam);try{await cloud.update('team_posts',`id=eq.${post.id}&owner_id=eq.${cloud.uid}`,{status:post.status==='open'?'closed':'open'});await window.renderCampusCommunity()}catch(err){showToast(err.message)}return}
 const chat=e.target.closest('[data-team-chat]');if(chat){await openTeamChat(chat.dataset.teamChat);return}const skillChat=e.target.closest('[data-skill-chat]');if(skillChat){await openSkillChat(skillChat.dataset.skillChat);return}
});
document.querySelector('#community-chat-form').addEventListener('submit',async e=>{e.preventDefault();const input=document.querySelector('#community-chat-input'),body=input.value.trim();if(!body||!activeTeamChat)return;try{if(activeTeamChat.kind==='team')await cloud.insert('team_messages',{post_id:activeTeamChat.id,sender_id:cloud.uid,body});else await cloud.insert('skill_messages',{session_id:activeTeamChat.id,sender_id:cloud.uid,body});input.value='';await refreshCommunityChat()}catch(err){showToast(err.message)}});
async function openTeamChat(postId){activeTeamChat={kind:'team',id:postId};document.querySelector('#community-chat-title').textContent=communityData.teams.find(p=>p.id===postId)?.event_name||'Team chat';document.querySelector('#community-chat-dialog').showModal();await refreshCommunityChat();clearInterval(teamChatTimer);teamChatTimer=setInterval(()=>{if(document.querySelector('#community-chat-dialog').open)refreshCommunityChat().catch(()=>{})},5000)}
async function openSkillChat(sessionId){activeTeamChat={kind:'skill',id:sessionId};document.querySelector('#community-chat-title').textContent='Skill session chat';document.querySelector('#community-chat-dialog').showModal();await refreshCommunityChat();clearInterval(teamChatTimer);teamChatTimer=setInterval(()=>{if(document.querySelector('#community-chat-dialog').open)refreshCommunityChat().catch(()=>{})},5000)}
async function refreshCommunityChat(){if(!activeTeamChat||!cloudMode||!cloudUser)return;const table=activeTeamChat.kind==='team'?'team_messages':'skill_messages',key=activeTeamChat.kind==='team'?'post_id':'session_id',messages=await cloud.select(table,`select=*&${key}=eq.${activeTeamChat.id}&order=created_at.asc`);const box=document.querySelector('#community-chat-messages');box.innerHTML=messages.map(m=>`<div class="chat-message ${m.sender_id===cloud.uid?'mine':''}"><p>${esc(m.body)}</p><small>${new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')||'<div class="chat-empty">Say hello and coordinate your first meeting.</div>';box.scrollTop=box.scrollHeight}
document.querySelector('#community-chat-dialog').addEventListener('close',()=>{activeTeamChat=null;clearInterval(teamChatTimer)});
setInterval(()=>{if(screen==='community'&&cloudMode&&cloudUser&&document.visibilityState==='visible')window.renderCampusCommunity()},30000);
document.addEventListener('click',e=>{if(e.target.closest('[data-community-retry]'))window.renderCampusCommunity()});
