# Separadores decimales en la plantilla de carga masiva

**Fecha:** 2026-10-06  
**Estado:** aprobado para planificación

## Problema

La plantilla aplica a `E2:E5001` una validación de Excel de tipo decimal con una alerta
`stop`. Excel interpreta los números con el separador decimal configurado en el equipo. Cuando el
separador local es la coma, una entrada válida para el importador como `300.50` queda como texto y
Excel la bloquea antes de guardar el archivo.

El importador ya acepta valores numéricos y textos con punto o coma, los normaliza y aplica las
reglas reales del catálogo. La validación de la plantilla contradice ese comportamiento y, además,
su mensaje promete limitar a dos decimales aunque la regla de Excel solo comprueba que el número
sea mayor que cero.

Esta especificación reemplaza únicamente la regla de precio descrita en la sección 8 de
`2026-10-02-excel-reporte-y-carga-masiva-design.md`.

## Comportamiento esperado

La persona podrá escribir o pegar precios usando cualquiera de estas formas:

| Entrada en Excel | Valor normalizado por la aplicación |
| --- | --- |
| `300,50` | `300.50` |
| `300.50` | `300.50` |
| `300,5` | `300.50` |
| `300.5` | `300.50` |

El formato interno canónico seguirá siendo un texto decimal con punto y dos posiciones. No se
cambiará el contrato con la base de datos ni las reglas monetarias del catálogo.

## Diseño

La columna de precio conservará el formato visual `#,##0.00` y el mensaje de ayuda al seleccionar
una celda. La regla seguirá siendo de tipo decimal para conservar ese comportamiento en los Excel
que reconocen la entrada como número, pero tendrá `showErrorMessage: false` y dejará de incluir
`errorStyle`, `errorTitle` y `error`. Su ayuda indicará que se permiten punto y coma, que el precio
debe ser mayor que cero y que se revisará al subir el archivo.

Excel podrá guardar una entrada que no reconozca como número local. Al leer el archivo,
`cellPrice` continuará siendo la única validación autoritativa: normalizará texto con punto o coma,
convertirá números a dos posiciones y rechazará cero, negativos, importes fuera del límite o
fracciones reales con más de dos decimales. La vista previa mostrará esos errores antes de importar.

No se duplicará la normalización mediante una fórmula de Excel. Mantener una sola implementación
evita diferencias entre Excel, Excel web, LibreOffice y el servidor.

## Pruebas

- La plantilla conserva el formato y el mensaje de ayuda de la columna de precio, pero no genera
  una alerta bloqueante.
- Un recorrido completo de escritura, guardado y lectura normaliza `300.50` y `300,50` como
  `300.50`.
- Las pruebas existentes siguen verificando números, separadores de miles y símbolos de soles.
- Se verifica que entradas con más de dos decimales reales continúen produciendo un error en la
  vista previa.

## Límite conocido

Un texto con un solo separador seguido de exactamente tres cifras (`300,505`, `1.250`) se lee como
separador de miles: 300505 y 1250, no como un precio con más de dos decimales. Es lo que hace falta
para `1,299` o `1.299`, y es como lo interpreta Excel cuando ese separador es el de miles. La vista
previa muestra el precio leído antes de importar. Un número de Excel con tres decimales (por
ejemplo, `300,505` escrito en un Excel con coma decimal) sí se rechaza.

## Criterios de aceptación

- En una instalación de Excel con coma decimal, se puede guardar `300.50` sin un modal de error.
- `300.50` y `300,50` producen el mismo precio en la vista previa y al importar.
- Ningún valor inválido llega a la operación de importación; se rechaza durante la vista previa.
- Las demás validaciones de la plantilla no cambian.
