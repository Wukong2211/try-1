// Small REST client for the static PWA; uses only the public publishable key.
(() => {
  const config = window.BORROWED_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) return;
  const sessionKey = 'borrowed-supabase-session-v1';
  let session = null;
  let passwordRecoveryPending = false;
  try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch {}
  const base = config.url.replace(/\/$/, '');
  const persist = () => session ? localStorage.setItem(sessionKey, JSON.stringify(session)) : localStorage.removeItem(sessionKey);
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.get('type') === 'recovery' && params.get('access_token')) {
      session = {access_token:params.get('access_token'), refresh_token:params.get('refresh_token'), token_type:params.get('token_type') || 'bearer'};
      passwordRecoveryPending = true;
      persist();
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    }
  } catch {}
  async function auth(path, body) {
    const response = await fetch(`${base}/auth/v1/${path}`, {method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(result.msg || result.message || result.error_description || result.error || 'Authentication failed');
    return result;
  }
  async function request(path, options={}, retried=false) {
    const headers = {apikey:config.publishableKey,Authorization:`Bearer ${session?.access_token || config.publishableKey}`,...options.headers};
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    let response;
    try { response=await fetch(`${base}/rest/v1/${path}`, {...options,signal:options.signal||controller.signal,headers:{...headers,'Content-Type':'application/json'}}); }
    catch(error) { if(controller.signal.aborted) throw new Error('Supabase did not respond in time. Check your connection and try again.'); throw error; }
    finally { clearTimeout(timeout); }
    if (response.status===401 && session?.refresh_token && !retried) {
      const refreshed=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
      session=refreshed;persist();return request(path,options,true);
    }
    const body=await response.text();let result=null;try{result=body?JSON.parse(body):null}catch{result=body}
    if(!response.ok)throw new Error(result?.message||result?.details||result?.hint||`Supabase request failed (${response.status})`);
    return result;
  }
  async function storageRequest(path, options={}) {
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(`${base}/storage/v1/${path}`,{...options,signal:controller.signal,headers:{apikey:config.publishableKey,Authorization:`Bearer ${session?.access_token||config.publishableKey}`,...options.headers}});
      const body=await response.text();let result=null;try{result=body?JSON.parse(body):null}catch{result=body}
      if(!response.ok)throw new Error(result?.message||result?.error||`Supabase Storage request failed (${response.status})`);
      return result;
    } catch(error) { if(controller.signal.aborted)throw new Error('Photo upload timed out. Check your connection and try again.');throw error; }
    finally { clearTimeout(timeout); }
  }
  const objectPath=path=>String(path).split('/').map(encodeURIComponent).join('/');
  window.BorrowedBackend={
    configured:true,
    get session(){return session},
    get uid(){return session?.user?.id||null},
    get passwordRecoveryPending(){return passwordRecoveryPending},
    clearPasswordRecovery:()=>{passwordRecoveryPending=false},
    signUp:async(email,password,name)=>{const native=window.Capacitor?.isNativePlatform?.()===true;const target=!native&&(location.protocol==='http:'||location.protocol==='https:')?`signup?redirect_to=${encodeURIComponent(`${location.origin}${location.pathname}`)}`:'signup';const result=await auth(target,{email,password,data:{display_name:name}});if(result.access_token){session=result;persist()}return result},
    signIn:async(email,password)=>{session=await auth('token?grant_type=password',{email,password});persist();return session},
    requestPasswordReset:async(email)=>{const redirect=location.protocol==='http:'||location.protocol==='https:'?`?redirect_to=${encodeURIComponent(`${location.origin}${location.pathname}`)}`:'';return auth(`recover${redirect}`,{email})},
    updatePassword:async(password)=>{if(!session?.access_token)throw new Error('The password reset link is missing or expired. Request a new link.');const response=await fetch(`${base}/auth/v1/user`,{method:'PUT',headers:{apikey:config.publishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({password})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.msg||result.message||result.error_description||result.error||'Could not update the password.');if(session)session.user=result;persist();return result},
    signOut:async()=>{if(session?.access_token)await fetch(`${base}/auth/v1/logout`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${session.access_token}`}}).catch(()=>{});session=null;persist()},
    currentUser:async()=>{if(!session?.access_token)return null;let response=await fetch(`${base}/auth/v1/user`,{headers:{apikey:config.publishableKey,Authorization:`Bearer ${session.access_token}`}});if(response.status===401&&session.refresh_token){session=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});persist();response=await fetch(`${base}/auth/v1/user`,{headers:{apikey:config.publishableKey,Authorization:`Bearer ${session.access_token}`}})}if(!response.ok)return null;session.user=await response.json();persist();return session.user},
    select:(table,query='')=>request(`${table}?${query}`),
    insert:(table,rows)=>request(table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(rows)}),
    update:(table,query,values)=>request(`${table}?${query}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(values)}),
    remove:(table,query)=>request(`${table}?${query}`,{method:'DELETE'}),
    rpc:(name,args)=>request(`rpc/${name}`,{method:'POST',body:JSON.stringify(args)}),
    uploadStorage:(bucket,path,file,contentType)=>storageRequest(`object/${encodeURIComponent(bucket)}/${objectPath(path)}`,{method:'POST',headers:{'Content-Type':contentType},body:file}),
    removeStorage:(bucket,paths)=>storageRequest(`object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths})}),
    storagePublicUrl:(bucket,path)=>`${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath(path)}`
  };
})();
