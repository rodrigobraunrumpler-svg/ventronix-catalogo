# Prototipo visual del catálogo

Abre `index.html` en un navegador moderno. Es un archivo autocontenido: funciona sin instalar dependencias, sin conectar Supabase y sin publicar nada.

## Dirección visual propuesta

- Fondo gris verdoso `#F5F7F6`, superficies blancas y texto verde oscuro `#23382F`.
- Acción principal en verde bosque `#245B46`; estados suaves en salvia `#E9F1EC`.
- Navegación lateral, tabla espaciosa, códigos monoespaciados y precios alineados.
- Tipografías locales Ubuntu/Ubuntu Sans y alternativas del sistema; no descarga fuentes externas.
- En móvil, navegación superior y productos adaptados a tarjetas legibles.

## Qué puedes probar

- Navegar entre productos y categorías.
- Buscar por nombre/código, filtrar y cambiar de página.
- Crear y editar productos, con una vista previa de los campos.
- Eliminar productos con confirmación.
- Crear/renombrar categorías y eliminar las que están vacías.
- Ver validaciones de código duplicado, nombre de categoría repetido y precio inválido.
- Abrir la ayuda con el botón `?` y restablecer los datos de ejemplo.

Los cambios permanecen solo en memoria y desaparecen al recargar. Los productos y precios son ficticios; PEN es una referencia visual, aún por confirmar para la aplicación. Esta maqueta no autentica usuarios ni envía mensajes.

Para hacer visible la paginación con pocos datos de ejemplo se muestran 8 productos por página; el plan de la aplicación mantiene 20. La búsqueda de esta maqueta responde en 120 ms; la implementación prevista utiliza 300 ms. La vista previa del formulario es una propuesta visual para revisar, no un cambio automático del alcance.

El prototipo explora únicamente categorías y productos. No define los campos ni el diseño de la proforma, PDF o WhatsApp.

## Vista local opcional

Desde la carpeta del proyecto:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory prototype
```

Abre `http://127.0.0.1:8765`. También puedes abrir directamente `index.html` sin servidor.
