# Monkstore on Kubernetes

> ⚠️ **Intentionally vulnerable training app.** Deploy only to a private/local
> cluster (kind, minikube, k3d). Never expose it to the internet.

Services are named `db`, `backend`, and `web` so the same `DATABASE_URL` and the
web container's nginx proxy (`proxy_pass http://backend:3000`) work in both Docker
Compose and Kubernetes.

## Build & load images (local cluster)

```bash
# Build
docker build -t monkstore-backend:latest ./apps/backend
docker build -t monkstore-web:latest ./apps/frontend

# Load into the cluster (kind example)
kind load docker-image monkstore-backend:latest
kind load docker-image monkstore-web:latest
# minikube: `minikube image load monkstore-backend:latest` (and web)
```

## Deploy

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml

# Create your Secret from the template (never commit real values):
cp k8s/secret.example.yaml k8s/secret.yaml
#   - set POSTGRES_PASSWORD + matching DATABASE_URL
#   - set JWT_SECRET  (openssl rand -hex 32)
kubectl apply -f k8s/secret.yaml

kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/web.yaml

# Apply migrations + seed the catalog (idempotent):
kubectl apply -f k8s/migrate-seed-job.yaml

# Optional ingress (needs an ingress controller):
kubectl apply -f k8s/ingress.yaml
#   echo "127.0.0.1 monkstore.local" | sudo tee -a /etc/hosts
```

## Access without ingress

```bash
kubectl -n monkstore-lab port-forward svc/web 8081:80
# open http://localhost:8081
```

## Notes

- `secret.yaml` (and anything matching `*secret*`) is gitignored on purpose.
- Stripe stays in TEST mode; leave `STRIPE_*` empty to use the built-in
  "simulate" deposit flow.
