# Estratégia de Versionamento: Trunk-Based Development

Na Sabia Labs, adotamos o **Trunk-Based Development (TBD)** combinado com a promoção de artefatos (GitOps) como nossa estratégia oficial de fluxo de trabalho no repositório `kivo`. 

Esta decisão foi tomada para garantir integração contínua verdadeira, reduzir conflitos de código e assegurar que o que testamos é exatamente o que publicamos.

## A Regra de Ouro
**Construa o artefato uma única vez e promova-o entre os ambientes.**

Não fazemos merge de código entre branches de ambiente (ex: não fazemos merge da `staging` para a `main`). Em vez disso, geramos uma única imagem Docker (o "artefato") a partir da `main`, e essa mesma imagem viaja pelo Staging até chegar em Produção.

---

## Como Funciona o Fluxo no Dia a Dia?

### 1. A Branch `main` é a Fonte da Verdade
A branch `main` (o nosso "Trunk") é sagrada. Ela deve estar sempre em um estado "pronto para deploy". O código que está na `main` é o código que vai rodar nos servidores.

### 2. Desenvolvimento de Features
Quando você assumir um ticket no board (ex: `FOR-70`), siga os passos:

1. Atualize sua `main` local: `git checkout main && git pull origin main`
2. Crie uma branch a partir da `main`: `git checkout -b feature/FOR-70-nome-da-feature`
3. Trabalhe no seu código e faça os commits localmente.

### 3. Integração Contínua (Pull Request)
Assim que a feature estiver pronta (ou pronta para revisão):
1. Faça o push da sua branch: `git push origin feature/FOR-70-nome-da-feature`
2. Abra um **Pull Request (PR)** apontando para a branch `main`.
3. O CI vai rodar testes e validações contra a sua branch.
4. Peça revisão de código (Code Review) para seus colegas.

### 4. O Merge e a Imutabilidade
Quando o PR for aprovado e "mergeado" na `main`:
1. O nosso **GitHub Actions** será acordado automaticamente.
2. Ele fará o build da sua aplicação gerando Imagens Docker (com a tag do Hash do seu commit, ex: `a1b2c3d`).
3. O Actions envia essas imagens para o **Google Artifact Registry** através de uma conexão segura sem senhas (Workload Identity Federation).

### 5. O Fluxo de Staging para Produção (CD / GitOps)
* **Staging (Validação):** O ambiente de Staging é configurado para "escutar" todas as novas imagens que chegam da `main`. Quando o GitHub Actions termina de subir a imagem `a1b2c3d` no Registry, o **ArgoCD** percebe e aplica essa imagem automaticamente no cluster de Staging. Todos podem testar a feature no ar.
* **Produção (Release):** O ambiente de Produção não é atualizado a cada merge. Para levar o código para Produção, não criamos código novo. Nós apenas orientamos o ArgoCD a atualizar a Produção para usar a exata mesma tag da imagem que foi aprovada no Staging (`a1b2c3d`). Isso garante que não haja surpresas no ambiente ao vivo!

---

## Resumo dos Benefícios
- **Menos Conflitos de Merge:** Ao invés de merges gigantescos que ficam dias abertos em branches isoladas, integramos o código constantemente na `main`.
- **Previsibilidade:** Sem o risco de testar uma compilação em Staging e, ao fazer o merge para Produção, o compilador gerar um binário levemente diferente. A mesma imagem viaja por todos os ambientes.
- **Velocidade:** Se der um bug grave na Produção, você pode simplesmente fazer um "Rollback" dizendo pro ArgoCD voltar para a tag anterior (ex: `z9y8x7w`). A reversão ocorre em segundos.
