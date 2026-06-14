# 🚀 Kivo Infrastructure - Hetzner VPS

O ambiente está configurado e seguro com HTTPS!

### 🌍 Endereços Oficiais
- **Aplicação (App):** 👉 [https://kivo-stg.sabialabs.de](https://kivo-stg.sabialabs.de)
- **Site (WWW - Cloudflare):** 👉 [https://www.sabialabs.de](https://www.sabialabs.de)
- **Admin API:** 👉 [https://kivo-stg.sabialabs.de/api](https://kivo-stg.sabialabs.de/api)

### 🔑 Credenciais Google OAuth
- **Redirect URI:** `https://kivo-stg.sabialabs.de/api/auth/callback/google`

### 🛠️ Comandos Úteis
- **Deploy:** `make up ENV=hetzner`
- **Reset DB:** `make db-reset ENV=hetzner`
- **Logs:** `kubectl logs -l app.kubernetes.io/instance=kivo -n kivo-staging`
