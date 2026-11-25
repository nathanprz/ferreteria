"use strict";
/* Capa de datos: guarda "documentos" JSON en una sola tabla de Supabase (public.docs)
   con la misma interfaz simple que usa la app: doc(path).get/set/update/delete/onSnapshot
   y collection(path).onSnapshot/doc(). */
function makeDb(sb){
  const split = p => { const i = p.lastIndexOf('/'); return { col: p.slice(0,i), id: p.slice(i+1) }; };
  const rid = () => Math.random().toString(36).slice(2,11) + Date.now().toString(36).slice(-3);
  const POLL_MS = 25000;
  let chSeq = 0;

  function watch(fetchFn, deliver, onError, filter){
    let alive = true, busy = false, again = false, timer = null, ch = null;
    const run = async () => {
      if (!alive) return;
      if (busy) { again = true; return; }
      busy = true;
      try { const v = await fetchFn(); if (alive) deliver(v); }
      catch (e) { if (alive && onError) onError(e); }
      busy = false;
      if (again) { again = false; run(); }
    };
    const kick = () => { clearTimeout(kick.t); kick.t = setTimeout(run, 150); };
    run();
    try {
      ch = sb.channel('docs-' + (++chSeq))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter }, kick)
        .subscribe();
    } catch (_) {}
    timer = setInterval(run, POLL_MS);
    return () => { alive = false; clearInterval(timer); try { if (ch) sb.removeChannel(ch); } catch (_) {} };
  }

  function docRef(path){
    const { col, id } = split(path);
    return {
      id, path,
      async get(){
        const { data, error } = await sb.from('docs').select('data').eq('path', path).maybeSingle();
        if (error) throw error;
        return { id, exists: !!data, data: () => data ? data.data : undefined };
      },
      async set(d){
        const { error } = await sb.from('docs').upsert({ path, collection: col, data: d, updated_at: new Date().toISOString() });
        if (error) throw error;
      },
      async update(d){
        const cur = await sb.from('docs').select('data').eq('path', path).maybeSingle();
        if (cur.error) throw cur.error;
        if (!cur.data) throw new Error('El registro no existe');
        const { error } = await sb.from('docs').update({ data: { ...cur.data.data, ...d }, updated_at: new Date().toISOString() }).eq('path', path);
        if (error) throw error;
      },
      async delete(){
        const { error } = await sb.from('docs').delete().eq('path', path);
        if (error) throw error;
      },
      onSnapshot(next, err){
        return watch(
          async () => { const { data, error } = await sb.from('docs').select('data').eq('path', path).maybeSingle(); if (error) throw error; return data; },
          row => next({ id, exists: !!row, data: () => row ? row.data : undefined }),
          err, 'path=eq.' + path);
      }
    };
  }
  function colRef(path){
    return {
      path,
      doc: id => docRef(path + '/' + (id || rid())),
      onSnapshot(next, err){
        return watch(
          async () => { const { data, error } = await sb.from('docs').select('path,data').eq('collection', path).limit(5000); if (error) throw error; return data; },
          rows => next({ docs: rows.map(r => ({ id: r.path.slice(path.length + 1), data: () => r.data })) }),
          err, 'collection=eq.' + path);
      }
    };
  }
  return { doc: docRef, collection: colRef };
}
