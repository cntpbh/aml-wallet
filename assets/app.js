const out = document.getElementById('out');
const btnScreen = document.getElementById('btnScreen');
const btnProfile = document.getElementById('btnProfile');

function setOut(obj) {
  out.textContent = JSON.stringify(obj, null, 2);
}

function getInputs() {
  const chain = document.getElementById('chain').value.trim();
  const address = document.getElementById('address').value.trim();
  return { chain, address };
}

async function callApi(path, params) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

btnScreen.addEventListener('click', async () => {
  const { chain, address } = getInputs();
  if (!chain || !address) return setOut({ error: "Informe rede e endereço." });

  btnScreen.disabled = true;
  setOut({ status: "Consultando fontes AML..." });

  try {
    const data = await callApi('/api/screen', { chain, address });
    setOut(data);
  } catch (e) {
    setOut({ error: String(e?.message || e) });
  } finally {
    btnScreen.disabled = false;
  }
});

btnProfile.addEventListener('click', async () => {
  const { chain, address } = getInputs();
  if (!chain || !address) return setOut({ error: "Informe rede e endereço." });

  btnProfile.disabled = true;
  setOut({ status: "Gerando perfil on-chain..." });

  try {
    const data = await callApi('/api/profile', { chain, address });
    setOut(data);
  } catch (e) {
    setOut({ error: String(e?.message || e) });
  } finally {
    btnProfile.disabled = false;
  }
});
