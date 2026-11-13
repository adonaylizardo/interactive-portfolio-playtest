# Escribe piezas.json v2 (BORRADOR) a partir de ambar-v2.json + metadatos. piezas.v1.json se conserva.
import json, os, sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import build_primera_persona as B, v2_piezas as P, v2_cabina as V
OUT=B.OUT; R=json.load(open(f'{OUT}/src/ambar-v2.json')); PZ=R['piezas']
def files(n): return {'png1x':f'piezas/{n}@1x.png','png2x':f'piezas/{n}@2x.png'}
def sz(n): return [PZ[n]['w'],PZ[n]['h']],[PZ[n]['w']*2,PZ[n]['h']*2]
def item(id,n,capa,tipo,pixi,ancla,metros,z,notas,**kw):
    a,b=sz(n); d=dict(id=id,capa=capa,tipo=tipo,pixi=pixi,archivos=files(n),tamano_1x=a,tamano_2x=b,metros=metros,ancla=ancla,zindex=z,notas=notas,ambar_pct=PZ[n]['ambar_pct'])
    d.update(kw); return d
piezas=[]
piezas.append(item('cielo-noche','cielo-noche__tile',0,'tile horizontal','TilingSprite',{'px_1x':[0,360],'regla':'fila 360 = horizonte'},None,'fondo, -1e9','sin cambios respecto a v1; envuelve en x; 2048 px = 360° de giro',parallax={'x':'tilePosition.x = −yaw·2048/360°','y':0}))
piezas.append(item('cerros-avila','cerros-avila__tile',1,'tile horizontal sin costura','TilingSprite',{'px_1x':[0,P.AV_H-2],'regla':'fila 126 del tile = horizonte (y=360); sprite.y = 362−128 = 234'},
    {'nota':'lejano; no se escala con z'},'fondo, -1e8',
    'NUEVO. Silueta del Ávila (cresta lejana + colinas cercanas), torre del Humboldt con 2 luces frías, luces de barrio frías. Periodo 2048 px; mismo parallax que el cielo pero ×1,0 (ambos en el infinito).',parallax={'x':'igual que el cielo','y':0},humboldt_x_px=PZ['cerros-avila__tile'].get('humboldt_x')))
for n in ('suelo-avenida__fase-a','suelo-avenida__fase-b'):
    piezas.append(item(n,n,2,'franja de suelo (sección transversal)','Graphics (proyectado cada frame)',{'px_1x':[256,0],'regla':'x=256 = eje de la avenida; 16 px/m; cubre −16…+16 m'},{'ancho':32,'fondo':3},'suelo, bajo todo',
        'sin cambios; alternar fase-a/fase-b cada 3 m de z; cada fila se dibuja como trapecio proyectado con los colores leídos de la franja'))
for n,(fn,nota) in P.STRIPS.items():
    piezas.append(item(n,n,2,'franja de suelo (sección transversal)','Graphics (proyectado cada frame)',{'px_1x':[256,0],'regla':'x=256 = eje; 16 px/m'},{'ancho':32,'fondo':3 if 'plaza' in n else 0.5},'suelo','NUEVO. '+nota))
piezas.append(item('suelo-cruce__planta','suelo-cruce__planta',2,'planta cenital de referencia','referencia / textura opcional',{'px_1x':[256,256],'regla':'centro del cruce; 16 px/m; +z hacia arriba de la imagen'},{'ancho':32,'fondo':32},'suelo',
    'NUEVO. Cruce de 4 brazos en planta a 16 px/m. En runtime NO se usa como textura en perspectiva: suelo-cruce__spec.json da los polígonos en metros para proyectarlos con Graphics (igual que la avenida). Sirve de verdad visual y para el minimapa.',spec='piezas/suelo-cruce__spec.json'))
piezas.append(item('suelo-plaza__planta','suelo-plaza__planta',2,'planta cenital sin costura','referencia / textura opcional',{'px_1x':[0,0],'regla':'tile 16×16 m, envuelve en x y z'},{'ancho':16,'fondo':16},'suelo',
    'NUEVO. Losas de 2×2 m. En perspectiva usar las franjas suelo-plaza__fase-a/b (fase-a en la junta cada 2 m).'))
for key,f in {**{k:B.FACH[k] for k in ('teresa-carreno','biblioteca-ingenieria','catedral-de-barquisimeto')},**P.FACH2}.items():
    ne=f'fachada-{key}__luz-encendida'; na=f'fachada-{key}__luz-apagada'
    m=f.get('m',(round(f['u1']-f['u0'],1),f['v1']))
    d=item(f'fachada-{key}',ne,3,'plano frontal','Sprite',{'px_1x':PZ[ne]['ancla'],'regla':'centro-abajo (pie de la fachada; x = u=0 del edificio); anchor = (ancla.x/w, ancla.y/h)'},
        {'ancho':m[0],'alto':m[1]},'−z','re-exportada v2 (BOX→@1x, NEAREST→@2x)' if key in B.FACH else 'NUEVO. Basada en el iso '+f.get('iso',''))
    d['variantes']={'luz-encendida':files(ne),'luz-apagada':files(na)}
    d['ambar_pct']={'luz-encendida':PZ[ne]['ambar_pct'],'luz-apagada':PZ[na]['ambar_pct']}
    d['escala']='scale = f/(z·16) = 57,125/z'
    if 'iso' in f: d['iso_referencia']=f['iso']
    piezas.append(d)
piezas.append(item('farol-frente','farol-frente__estado-encendido',4,'billboard','Sprite',{'px_1x':[6,75],'regla':'pie del poste'},{'ancho':1.5,'alto':4.6},'−z','re-exportado v2; el halo se dibuja aparte (3 anillos duros, alfa bajo) como en v1'))
piezas.append(item('arbol-cuji-frente','arbol-cuji-frente',4,'billboard (Estilo C)','Sprite',{'px_1x':PZ['arbol-cuji-frente']['ancla'],'regla':'pie del tronco'},{'ancho':7.8,'alto':6.6},'−z',
    'NUEVO. Cují en Estilo C (racimos G1/G2/G3, tronco texturado, contorno propLine 1 px). Sustituye al árbol de marcador de v1 en ambos frames.'))
piezas.append(item('banco-frente','banco-frente',4,'billboard','Sprite',{'px_1x':PZ['banco-frente']['ancla'],'regla':'centro de las patas'},{'ancho':2.0,'alto':1.0},'−z','NUEVO. Banco de listones de madera (wood) con patas grafito; sustituye al banco de marcador de v1.'))
piezas.append(item('jac-t9-capo','jac-t9-capo',5,'overlay fijo a la cámara','Sprite',{'px_1x':[0,0],'regla':'(0,0) del viewport'},None,'5 (sobre el mundo)','re-exportado con el pipeline v2; sin cambios de dibujo'))
for tag,nota in (('luces-on','pantallas encendidas: cuadro (2 arcos con marcas blancas y rojas, pantalla central con carro y "319"), pantalla vertical con mosaicos; 3 testigos ámbar'),('luces-off','pantallas negras con reflejo frío tenue; botonera y rejillas visibles; 0 ámbar')):
    n=f'jac-t9-cabina__{tag}'
    piezas.append(item(n,n,6,'overlay fijo a la cámara','Sprite',{'px_1x':[0,0],'regla':'(0,0) del viewport'},None,'6',
        ('REEMPLAZA a la cabina v1. ' if tag=='luces-on' else 'NUEVO. ')+nota+'. NO incluye el volante (pieza aparte, capa 7). Incluye techo con franja de techo solar, parasoles, pilares A, espejo lateral, plumillas, tablero con rejilla, banda de cuero con costura, rejilla izquierda cromada, palancas, cuadro con capota, pantalla vertical con bisel cromado + botonera (botón rojo de emergencia), rejilla vertical alta, retrovisor con barra del platón y cabecera del copiloto.'))
piezas.append(item('jac-t9-volante','jac-t9-volante',7,'sprite fijo a la cámara (rota)','Sprite',{'px_1x':list(V.WHUB),'regla':'centro del cubo; anchor = (232/464, 232/426) = (0,5, 0,5446)'},{'diametro_aprox':0.38},'7 (sobre la cabina)',
    'NUEVO. Colocar en (640,610) @1x. Rotación al doblar: hasta ±90° y volver. Aro negro grueso con fondo achatado, inserto en U plateado, placas plateadas con botones, marca de 12 h, insignia JAC ovalada cromada. En el frame B el fondo plano y la U inferior quedan fuera de pantalla (y>720); al rotar entran en cuadro.',pos_pantalla_1x=list(V.WHEEL_POS)))

# ---- JAC T9 exterior (frame C) ----
FCJ=json.load(open(f'{OUT}/src/frame-c.json')); FP_=FCJ['piezas']
import v2_t9ext as T9
NOTAS={'lado':'Lado pasajero, nariz hacia +u (derecha); espejar con scale.x=−1 para el lado conductor (nariz a la izquierda). Incluye barra deportiva con placa JAC, rieles del platón, lona negra vista desde arriba, barras de techo, estribo, molduras negras, rines flor/Y bicolor, luces partidas (tira LED + bloque bajo) en la esquina y piloto vertical. Válido solo con la T9 perpendicular al eje de la cámara.',
       'trasera':'Compuerta con J A C embutido, T9 y 4WD, pilotos LED verticales, parachoques negro con peldaño y reflectivos, barra deportiva vista de atrás, ventana trasera. Válido con la T9 alineada al eje de la cámara y centrada (de lado se vería el costado: no existe esa vista).',
       'frente':'Parrilla alta y plana de panal con JAC, tira LED fina arriba + bloque de faros abajo en la esquina del parachoques, protector plateado, placa en blanco. Mismas condiciones que la trasera.'}
for k,(fn,dm) in T9.T9EXT.items():
    na=f'jac-t9-ext__{k}__apagado'; nl=f'jac-t9-ext__{k}__luces'; a=FP_[na]
    m=[round(dm['u1']-dm['u0'],2),round(dm['v1'],2)]
    d=dict(id=f'jac-t9-ext__{k}',capa=4,tipo='billboard cercano (vehículo estacionado)',pixi='Sprite',
        archivos=dict(png1x=f'piezas/{na}@1x.png',png2x=f'piezas/{na}@2x.png'),tamano_1x=[a['w'],a['h']],tamano_2x=[a['w']*2,a['h']*2],
        metros=dict(ancho=m[0],alto=m[1]),ancla=dict(px_1x=a['ancla'],regla='pie del eje central del carro (v=0, u=0)'),zindex='−z (z = distancia al plano visible: lado o cara)',
        densidad_px_m=192,escala='scale = f/(z·192) = 4,76/z (1:1 a z = 4,76 m). Para z > 20 m usar el LOD de 16 px/m con scale = 57,125/z',
        variantes={'apagado':dict(png1x=f'piezas/{na}@1x.png',png2x=f'piezas/{na}@2x.png'),'luces':dict(png1x=f'piezas/{nl}@1x.png',png2x=f'piezas/{nl}@2x.png'),
                   'apagado__lod16':dict(png1x=f'piezas/{na}__lod16@1x.png',png2x=f'piezas/{na}__lod16@2x.png',tamano_1x=[FP_[na+'__lod16']['w'],FP_[na+'__lod16']['h']],ancla_px_1x=FP_[na+'__lod16']['ancla']),
                   'luces__lod16':dict(png1x=f'piezas/{nl}__lod16@1x.png',png2x=f'piezas/{nl}__lod16@2x.png')},
        ambar_pct={'apagado':a['ambar_pct'],'luces':FP_[nl]['ambar_pct']},
        notas='NUEVO (frame C). '+NOTAS[k]+' Luces = DRL y faros blancos fríos, pilotos rojos (no cuentan como ámbar), brillo interior frío tenue; los halos son 3 anillos de alfa bajo dentro de la pieza.')
    piezas.append(d)
cfg=dict(paquete='primera-persona · propuesta v2',estado='BORRADOR',fecha='2026-10-17',version=2,anterior='piezas.v1.json',viewport_ref_1x=[1280,720],horizonte_y=360,focal_px_1x=914,fov_h_grados=70,
    densidad='16 px/m @1x en el plano de la pieza',giros='solo 90°',
    exportacion='lienzo ×4 → @1x con BOX (alfa premultiplicado, sin halos oscuros) → @2x = @1x ×2 NEAREST',
    camaras={'a-pie':{'ojo_m':1.78,'x_m':7.2,'nota':'acera derecha'},'jac-t9':{'ojo_m':1.45,'x_m':2.23,'nota':'carril derecho, puesto izquierdo'}},
    proyeccion='x = 640 + (x − cam.x)·f/z ; y = 360 − (y − ojo)·f/z',
    capas={'0':'cielo (TilingSprite)','1':'Ávila (TilingSprite)','2':'suelo (Graphics proyectado cada frame, franjas cada 3 m)','3':'fachadas (Sprite, zIndex=−z, scale=f/(z·16))','4':'props billboard (zIndex=−z)','5':'capó (overlay)','6':'cabina (overlay 1280×720)','7':'volante (rota)'},
    frames={'a':{'png1x':'frames/frame-a-a-pie@1x.png','png2x':'frames/frame-a-a-pie@2x.png','ambar_pct':R['frames']['frame-a-a-pie'],'nota':'re-renderizado: cambiaron piezas compartidas (Ávila, árbol, banco)'},
            'b':{'png1x':'frames/frame-b-jac-t9@1x.png','png2x':'frames/frame-b-jac-t9@2x.png','ambar_pct':R['frames']['frame-b-jac-t9'],'nota':'escena + capó + cabina luces-on + volante'},
            'c':{'png1x':'frames/frame-c-a-pie-junto-t9@1x.png','png2x':'frames/frame-c-a-pie-junto-t9@2x.png','ambar_pct':FCJ['frame-c-a-pie-junto-t9'],
                 'camara':{'ojo_m':1.78,'x_m':0,'mira':'al otro lado de la calle (giro de 90° respecto a A)'},
                 'nota':'a pie en la acera, recién bajado; T9 estacionada junto al brocal, lado pasajero a z=4,76 m (escala 1:1 de la pieza), x centro −0,62 m; apagada',
                 'colocacion':{'t9_lado':{'x':-0.62,'z':4.76},'brocal_z':[4.45,4.62],'calle_z':[4.62,15.12],'acera_frente_z':[15.29,19.29],
                   'fachadas':[{'id':'casa-volaris','x':-30,'z':40},{'id':'casa-pg','x':-15,'z':33},{'id':'estudio-6x6','x':1.5,'z':30},{'id':'casa-mentoria','x':16,'z':29},{'id':'casa-bain','x':30,'z':36}],
                   'faroles':[{'x':-13,'z':15.9},{'x':4.5,'z':15.9},{'x':22,'z':15.9}],'arboles':[{'x':8.5,'z':20.8},{'x':-9,'z':21.5},{'x':23,'z':25.3}]}}},
    colocacion_en_frames=dict(fachadas=[{'id':'biblioteca-ingenieria','x':-21,'z':62},{'id':'teresa-carreno','x':14,'z':128},{'id':'catedral-de-barquisimeto','x':76,'z':150}],
        arboles=[{'x':40,'z':100},{'x':-40,'z':52},{'x':25,'z':56}],bancos=[{'x':10.6,'z':13},{'x':-10.6,'z':17}],faroles=[{'x':-9.6,'z':40},{'x':-9.6,'z':22},{'x':10,'z':38},{'x':10,'z':22},{'x':-12,'z':46.5},{'x':12,'z':46.5}]),
    regla_ambar='r>90, r−b>55, g>b, r≥g sobre píxeles con alfa>20 · tope 5 % por imagen',piezas=piezas)
json.dump(cfg,open(f'{OUT}/piezas.json','w'),ensure_ascii=False,indent=1); print(len(piezas),'piezas')
