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
    if 'fuente_ref' in f: d['fuente_ref']=f['fuente_ref']; d['notas']='REDIBUJADA desde fotos reales (v3, ver fuente_ref); mismo lienzo, ancla y metros que v2'
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

# ---- Frame C v3 (tercera persona): T9 re-proyectada + Adonay de espaldas ----
FCJ=json.load(open(f'{OUT}/src/frame-c.json')); FP_=FCJ['piezas']; CAMC=FCJ['camara']
t=FP_['jac-t9-ext__34-frontal-3p__apagado']
piezas.append(dict(id='jac-t9-ext__34-frontal-3p',capa=4,tipo='billboard cercano (vehículo estacionado), específico de pose',pixi='Sprite',
    archivos=dict(png1x='piezas/jac-t9-ext__34-frontal-3p__apagado@1x.png',png2x='piezas/jac-t9-ext__34-frontal-3p__apagado@2x.png'),
    tamano_1x=[t['w'],t['h']],tamano_2x=[t['w']*2,t['h']*2],metros=dict(largo=5.33,ancho=1.96,alto=1.84),
    ancla=dict(px_1x=t['ancla'],regla=t['ancla_def']+' (puede caer fuera del recorte: el parachoques no toca el suelo)'),
    pos_en_frame_c_1x=dict(bbox=t['bbox_en_frame']),pose=t['pose'],zindex='−z con z = 8,2 m (nariz)',
    escala='1:1 solo en la pose del frame C (nariz a 8,2 m, costado pasajero en x = 2,0 m, cámara 2,8 m). Para otras distancias a lo largo del mismo eje: scale ≈ 8,2/z (aprox.; la perspectiva interna no cambia)',
    ambar_pct={'apagado':t['ambar_pct']},tinte_noche_pixi='0xCCD1E6 (multiplicativo; el frame C lo aplica)',
    notas='NUEVO v3 (reemplaza jac-t9-ext lado/trasera/frente v1, RECHAZADAS → piezas/_obsoleto-t9ext-v1/). NO está redibujada: son los píxeles del render v3 aprobado (/workspace/jac3/se.jpg) re-proyectados cara por cara (lado pasajero, frente, capó, parabrisas, techo, lona) con homografías exactas a la cámara de 3ª persona. Vidrios: el magenta del fondo que se veía a través se neutralizó a vidrio oscuro. Sin variante de luces todavía.'))
for nm in ('adonay-espalda','adonay-espalda__idle','adonay-espalda__walk'):
    p=FP_[nm]; fr=p.get('frames',1)
    piezas.append(dict(id=nm,capa=8,tipo='jugador (3ª persona) · fijo en pantalla abajo-centro',pixi='AnimatedSprite' if fr>1 else 'Sprite',
        archivos=dict(png1x=f'piezas/{nm}@1x.png',png2x=f'piezas/{nm}@2x.png'),tamano_1x=[p['w'],p['h']],tamano_2x=[p['w']*2,p['h']*2],
        frames=fr,frame_1x=[192,300],metros=dict(alto=1.78),ancla=dict(px_1x=p['ancla'],anchor=[0.5,round(p['ancla'][1]/300,4)],regla='pies, centro (por frame)'),
        densidad_px_m=p.get('densidad_px_m',161.8),pos_pantalla_1x=[round(640+CAMC['adonay']['x_m']*914/CAMC['detras_m']),CAMC['adonay']['pies_y']],
        zindex='sobre todo el mundo (capa 8)',ambar_pct=p['ambar_pct'],
        notas='NUEVO. Adonay de ESPALDAS, pixel-art a resolución de arte 96×150 (1 px de arte = 2 px @1x), paleta exacta de forge-paquete/personaje/adonay (pelo rizado oscuro, sobrecamisa arena con tablón trasero y mangas remangadas, pulsera roja, culotte negro ancho, Converse mostaza de suela blanca). '
              +('Idle: 2 frames (respiración, 1 px). ' if nm.endswith('idle') else 'Walk: 4 frames (talón izq. arriba · paso · talón der. arriba · paso), braceo y rebote de 2 px; ~8 fps. ' if nm.endswith('walk') else 'Frame suelto de idle. ')
              +'El ámbar medido (~16 %) es ropa (arena/mostaza del sprite aprobado), no luz: con el tinte nocturno 0xCCD1E6 del frame deja de contar (frame C = '+str(FCJ['frame-c-a-pie-junto-t9'])+' %).'))
PC=CAMC['pantone']
for nm in ('pantone-espalda','pantone-espalda__idle','pantone-espalda__walk','pantone-espalda__sit'):
    p=FP_[nm]; fr=p.get('frames',1)
    piezas.append(dict(id=nm,capa=8,tipo='mascota (3ª persona) · sigue al jugador con offset fijo',pixi='AnimatedSprite' if fr>1 else 'Sprite',
        archivos=dict(png1x=f'piezas/{nm}@1x.png',png2x=f'piezas/{nm}@2x.png'),tamano_1x=[p['w'],p['h']],tamano_2x=[p['w']*2,p['h']*2],
        frames=fr,frame_1x=[88,132],metros=dict(alto_orejas=PC['alto_orejas_m'],alto_cruz_aprox=0.5),ancla=dict(px_1x=p['ancla'],anchor=[0.5,round(128/132,4)],regla='pies, centro (por frame)'),
        densidad_px_m=161.8,sigue_al_jugador=dict(offset_mundo_m=dict(dx=PC['dx_m'],dz=PC['dz_m'],nota='izquierda y por delante de los pies de Adonay (0,87 m)'),
            offset_pantalla_1x=PC['offset_pies_vs_adonay_1x'],pies_pantalla_1x=PC['pies_pantalla_1x'],scale_pixi=PC['escala_pixi'],
            regla='pos = pies_jugador + offset_pantalla_1x; scale = Z_jugador/(Z_jugador+dz) = 0,9417; zIndex justo debajo del jugador (está más lejos)'),
        zindex='capa 8, debajo del jugador',ambar_pct=p['ambar_pct'],
        notas='NUEVO. Pantone (husky) de ESPALDAS, pixel-art a la misma densidad que adonay-espalda (1 px de arte = 1,236 cm = 2 px @1x a la distancia de Adonay), paleta exacta de forge-paquete/personaje/pantone: manto gris en lomo y ancas, gorro oscuro con raya, mejillas blancas, orejas en punta, collar rojo, patas blancas, cola enroscada. '
              +({'pantone-espalda__idle':'Idle: 2 frames (vaivén de cola + respiración 1 px), ~3 fps. ','pantone-espalda__walk':'Walk: 4 frames (pata trasera izq. arriba · paso · trasera der. arriba · paso), cola que se mece; ~8–10 fps, sincronizar con el walk de Adonay. ','pantone-espalda__sit':'Sit: 1 frame; se usa tras ~30 s sin input (Adonay en idle), como en el mapa; con input vuelve a idle/walk. '}.get(nm,'Frame suelto de idle. '))
              +'Ámbar 0 %: pelo y collar no son luz.'))
_ix={p['id']:i for i,p in enumerate(piezas)}
if 'fachada-flor-de-venezuela-profundidad' in _ix and 'fachada-flor-de-venezuela' in _ix:
    fp=piezas[_ix['fachada-flor-de-venezuela-profundidad']]; ff=piezas[_ix['fachada-flor-de-venezuela']]
    fp['rol']='principal'; fp['alternativa']='fachada-flor-de-venezuela'
    fp['notas']='PRINCIPAL (elegida por Adonay, 17 oct 2026): Flor CON profundidad (pétalos traseros) en el lienzo actual 679×329, ancla [339,328]. '+fp['notas']
    ff['rol']='alternativa'; ff['alternativa_de']='fachada-flor-de-venezuela-profundidad'
    ff['notas']='ALTERNATIVA (plana, sin pétalos traseros). La principal es fachada-flor-de-venezuela-profundidad. '+ff['notas']
    piezas.remove(fp); piezas.insert(piezas.index(ff),fp)
cfg=dict(paquete='primera-persona · propuesta v2',estado='BORRADOR',fecha='2026-10-17',version=2,anterior='piezas.v1.json',viewport_ref_1x=[1280,720],horizonte_y=360,focal_px_1x=914,fov_h_grados=70,
    densidad='16 px/m @1x en el plano de la pieza',giros='solo 90°',
    exportacion='lienzo ×4 → @1x con BOX (alfa premultiplicado, sin halos oscuros) → @2x = @1x ×2 NEAREST',
    camaras={'tercera-persona':{'alto_m':2.8,'detras_m':5.649,'horizonte_y':252,'nota':'frame C; jugador visible de espaldas'},'a-pie':{'ojo_m':1.78,'x_m':7.2,'nota':'acera derecha'},'jac-t9':{'ojo_m':1.45,'x_m':2.23,'nota':'carril derecho, puesto izquierdo'}},
    proyeccion='x = 640 + (x − cam.x)·f/z ; y = 360 − (y − ojo)·f/z',
    capas={'0':'cielo (TilingSprite)','1':'Ávila (TilingSprite)','2':'suelo (Graphics proyectado cada frame, franjas cada 3 m)','3':'fachadas (Sprite, zIndex=−z, scale=f/(z·16))','4':'props billboard (zIndex=−z)','5':'capó (overlay)','6':'cabina (overlay 1280×720)','7':'volante (rota)','8':'jugador de espaldas (solo cámara 3ª persona, fijo abajo-centro)'},
    frames={'a':{'png1x':'frames/frame-a-a-pie@1x.png','png2x':'frames/frame-a-a-pie@2x.png','ambar_pct':R['frames']['frame-a-a-pie'],'nota':'re-renderizado: cambiaron piezas compartidas (Ávila, árbol, banco)'},
            'b':{'png1x':'frames/frame-b-jac-t9@1x.png','png2x':'frames/frame-b-jac-t9@2x.png','ambar_pct':R['frames']['frame-b-jac-t9'],'nota':'escena + capó + cabina luces-on + volante'},
            'c':{'png1x':'frames/frame-c-a-pie-junto-t9@1x.png','png2x':'frames/frame-c-a-pie-junto-t9@2x.png','ambar_pct':FCJ['frame-c-a-pie-junto-t9'],
                 'modo_camara':'TERCERA PERSONA over-the-shoulder','camara':CAMC,
                 'proyeccion':'x = 640 + (x − cam.x)·f/z ; y = 252 − (y − 2,80)·f/z  (f = 914, eje óptico desplazado: cámara nivelada, horizonte en y = 252)',
                 'nota':'Adonay de espaldas fijo abajo-centro (pies en y=705); Pantone de espaldas a su izquierda, 0,35 m por delante; T9 v3 re-proyectada en 3/4 frontal, estacionada en el canal de estacionamiento a su derecha-delante; apagada',
                 'colocacion':{'adonay':{'x':CAMC['adonay']['x_m'],'z':CAMC['detras_m']},'pantone':{'x':CAMC['pantone']['x_m'],'z':CAMC['pantone']['z_m'],'offset_vs_adonay_m':[CAMC['pantone']['dx_m'],CAMC['pantone']['dz_m']]},'t9':{'nariz_z':8.2,'costado_x':2.0},'acera_x':[-3.2,1.6],'brocal_x':[1.6,1.77],'calle_x':[1.77,11.3],
                   'calle_transversal_z':[38,46],'fachadas':[{'id':'casa-volaris','x':-19,'z':50},{'id':'estudio-6x6','x':-4,'z':50},{'id':'casa-bain','x':10.5,'z':50},{'id':'casa-mentoria','x':24,'z':50},{'id':'casa-pg','x':-12,'z':36},{'id':'casa-finoa','x':21.5,'z':30}],
                   'faroles':[{'x':1.3,'z':30},{'x':1.3,'z':15.5},{'x':11.8,'z':24}],'arboles':[{'x':-5.2,'z':31},{'x':-6.4,'z':21},{'x':-5.6,'z':14.5},{'x':17.5,'z':17}],'bancos':[{'x':-4.3,'z':16}]}}},
    colocacion_en_frames=dict(fachadas=[{'id':'biblioteca-ingenieria','x':-21,'z':62},{'id':'teresa-carreno','x':14,'z':128},{'id':'catedral-de-barquisimeto','x':76,'z':150}],
        arboles=[{'x':40,'z':100},{'x':-40,'z':52},{'x':25,'z':56}],bancos=[{'x':10.6,'z':13},{'x':-10.6,'z':17}],faroles=[{'x':-9.6,'z':40},{'x':-9.6,'z':22},{'x':10,'z':38},{'x':10,'z':22},{'x':-12,'z':46.5},{'x':12,'z':46.5}]),
    regla_ambar='r>90, r−b>55, g>b, r≥g sobre píxeles con alfa>20 · tope 5 % por imagen',piezas=piezas)
json.dump(cfg,open(f'{OUT}/piezas.json','w'),ensure_ascii=False,indent=1); print(len(piezas),'piezas')
