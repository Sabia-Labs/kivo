# 🚀 Kivo Infrastructure - Hetzner VPS

O ambiente está configurado e seguro com HTTPS!

### 🌍 Endereços Oficiais
- **Aplicação (App):** 👉 [https://kivo.sabialabs.de](https://kivo.sabialabs.de)
- **Site (WWW - Cloudflare):** 👉 [https://www.sabialabs.de](https://www.sabialabs.de)
- **Portal de Autenticação (Auth):** 👉 [https://auth.sabialabs.de](https://auth.sabialabs.de)
- **Admin API:** 👉 [https://auth.sabialabs.de/admin-api](https://auth.sabialabs.de/admin-api)

### 🔑 Credenciais Google OAuth
- **Redirect URI:** `https://auth.sabialabs.de/admin-api/auth/google/callback`

### 🛠️ Comandos Úteis
- **Deploy:** `make up ENV=hetzner`
- **Reset DB:** `make db-reset ENV=hetzner`
- **Logs:** `kubectl logs -l app.kubernetes.io/instance=kivo -n kivo-staging`
