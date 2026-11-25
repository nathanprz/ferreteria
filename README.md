# Ferretería: inventario, ventas y catálogo

- `/` catálogo público para clientes (productos, paquetes, ofertas, pedido por WhatsApp, catálogo en PDF).
- `/admin/` administración (ventas, inventario, pedido a proveedores, análisis, tienda). Pide correo y contraseña.
- Se instala en el celular como app (PWA).

## Puesta en marcha

1. Crea un proyecto gratis en https://supabase.com.
2. En **SQL Editor** pega `supabase/schema.sql` (cambia antes `TU_CORREO@ejemplo.com` por tu correo) y presiona Run.
3. En **Authentication > Users** crea un usuario con ese correo y una contraseña. En **Authentication > Sign In / Providers** desactiva el registro público ("Allow new users to sign up").
4. En **Project Settings > API** copia la *Project URL* y la *anon public key* y pégalas en `config.js`.
5. Sube este repo a GitHub y activa **Settings > Pages > Deploy from a branch > main / (root)**.
6. Abre `https://TU-USUARIO.github.io/TU-REPO/admin/`, entra, y en **Tienda web** pon tu WhatsApp. Carga los productos de ejemplo o agrega los tuyos.

## Instalar en el celular

Abre la página en el celular. En Android (Chrome) aparece "Instalar app". En iPhone (Safari): Compartir > Agregar a inicio.
Instala `/admin/` para tu inventario y comparte el enlace principal con tus clientes.

## Seguridad

La anon key es pública por diseño. Las reglas del esquema hacen que cualquiera lea el catálogo, pero solo el administrador lea costos y ventas y escriba datos.
