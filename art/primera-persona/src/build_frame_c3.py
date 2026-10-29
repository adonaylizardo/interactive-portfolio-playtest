# Frame C v3 (BORRADOR): TERCERA PERSONA over-the-shoulder.
# Cámara detrás y por encima de Adonay: altura 2,80 m, 5,65 m detrás de sus pies, nivelada, FOV 70° (f=914),
# eje óptico desplazado (lens shift) → horizonte en y=252 sin inclinar verticales (las fachadas siguen siendo billboards frontales).
# Adonay de espaldas fijo abajo al centro; la T9 v3 re-proyectada en 3/4 frontal, estacionada a su derecha-delante.
import json, os, sys, math, numpy as np
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); sys.path.insert(0,f'{HERE}/t9v3')
from PIL import Image, ImageDraw, ImageFilter
import build_primera_persona as B, build_v2 as BV, v2_piezas as P
import v2_adonay_espalda as AD, v2_pantone_espalda as PTN, reproj as RP
K=B.K; W,H=B.W,B.H; C=B.C; OUT=B.OUT; PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'
HZ3=252; CAM_H=2.80; F=914
Z_AD=1.78*F/(AD.FEET-4)/2     # 144 filas de arte ×2 px = 288 px → z=5,649 m (escala entera 2:1 del sprite)
Z_AD=1.78*F/288.0
X_AD=-0.15
ZF_T9, XS_T9 = 8.2, 2.0
PT_DX, PT_DZ = -0.80, 0.35   # Pantone respecto a los pies de Adonay: 0,80 m a su izquierda, 0,35 m por delante (0,87 m)      # nariz de la T9 a 8,2 m de la cámara; costado pasajero en x=2,0 (junto al brocal)
# calle (x = lateral, z = profundidad)
SW0,CURB0,CURB1,STR1=-3.2,1.6,1.77,11.3; FC1,FS1=11.47,15.5; ZX0,ZX1,ZS1,ZF=38.0,46.0,49.5,50.0

def cam3(): B.HZ=HZ3; return B.Cam(0,CAM_H)

def suelo3(im,cam):
    d=ImageDraw.Draw(im,'RGBA'); gp=lambda pts,f: B.gpoly(d,cam,pts,f); gl=lambda a,b,c,w=0.5: B.gline(d,cam,a,b,c,w)
    d.rectangle([0,HZ3*K,W*K,H*K],fill=C['tileSide'])
    gp([(-300,ZS1),(300,ZS1),(300,B.FAR),(-300,B.FAR)],C['grass'])
    gp([(-300,0),(SW0,0),(SW0,ZX0),(-300,ZX0)],C['grass'])                        # plaza izquierda
    gp([(FS1,0),(300,0),(300,ZX0),(FS1,ZX0)],C['grass'])
    gp([(SW0,0),(CURB0,0),(CURB0,ZX0),(SW0,ZX0)],C['propFace'])                    # acera de Adonay
    for x in np.arange(SW0,CURB0,1.6): gl((x,2.2),(x,ZX0),C['tileLine'],0.5)
    for z in np.arange(2.4,ZX0,1.6): gl((SW0,z),(CURB0,z),C['tileLine'],0.5)
    gl((SW0,2.2),(SW0,ZX0),C['propLine'],0.8)
    gp([(CURB0,0),(CURB1,0),(CURB1,ZX0),(CURB0,ZX0)],C['propLine'])                 # brocal
    gp([(CURB1,0),(STR1,0),(STR1,ZX0),(CURB1,ZX0)],(22,23,27))                     # asfalto
    gl((4.3,2.2),(4.3,ZX0-3),(52,55,61),0.6)                                       # línea de estacionamiento
    for z in np.arange(3,ZX0-4,9.0): gl((7.8,z),(7.8,z+3.5),(120,124,132),0.9)    # eje discontinuo
    for x in np.arange(CURB1+0.4,STR1-0.3,1.0): gp([(x,ZX0-2.6),(x+0.5,ZX0-2.6),(x+0.5,ZX0-0.4),(x,ZX0-0.4)],(92,96,104))  # cebra
    gp([(STR1,0),(FC1,0),(FC1,ZX0),(STR1,ZX0)],C['propLine'])
    gp([(FC1,0),(FS1,0),(FS1,ZX0),(FC1,ZX0)],C['propFace'])
    for z in np.arange(2.4,ZX0,1.6): gl((FC1,z),(FS1,z),C['tileLine'],0.5)
    gp([(-300,ZX0),(300,ZX0),(300,ZX0+0.17),(-300,ZX0+0.17)],C['propLine'])          # calle transversal
    gp([(-300,ZX0+0.17),(300,ZX0+0.17),(300,ZX1),(-300,ZX1)],(22,23,27))
    for x in np.arange(-80,80,9.0): gl((x,(ZX0+ZX1)/2),(x+3.5,(ZX0+ZX1)/2),(120,124,132),0.9)
    gp([(-300,ZX1),(300,ZX1),(300,ZX1+0.17),(-300,ZX1+0.17)],C['propLine'])
    gp([(-300,ZX1+0.17),(300,ZX1+0.17),(300,ZS1),(-300,ZS1)],C['propFace'])
    for x in np.arange(-60,60,1.6): gl((x,ZX1+0.17),(x,ZS1),C['tileLine'],0.5)

def avila3(im):
    t=BV.AVILA; row=np.asarray(t); cols=[(620+i)%P.AV_W for i in range(W)]
    crop=Image.fromarray(row[:,cols],'RGBA').resize((W*K,P.AV_H*K),Image.NEAREST)
    lay=Image.new('RGBA',im.size,(0,0,0,0)); lay.paste(crop,(0,(HZ3+2-P.AV_H)*K)); im.alpha_composite(lay)

NOCHE=np.array([0.80,0.82,0.90])   # gradación nocturna multiplicativa usada en el frame (= tint 0xCCD1E6 en Pixi)
def capa_t9(cam,noche=False):
    lay=RP.render(lambda x,y,z: cam.P(x,y,z),(W*K,H*K),ZF_T9,XS_T9)
    if noche:
        a=np.asarray(lay).astype(float); a[...,:3]*=NOCHE; lay=Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA')
    return lay

def sombra_t9(im,cam):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    B.gpoly(d,cam,[(XS_T9+0.05,ZF_T9+0.15),(XS_T9+1.9,ZF_T9+0.15),(XS_T9+1.9,ZF_T9+5.2),(XS_T9+0.05,ZF_T9+5.2)],(5,5,7,120))
    im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(2.5*K)))

def sprite_adonay(frame=None):
    return AD.personaje(**(frame or {}))

def coloca_adonay(im,cam,art,x=X_AD,z=Z_AD,noche=True):
    s=2*K*(F/z)/(F/Z_AD)      # 2 px @1x por píxel de arte a la distancia nominal
    big=art.resize((round(art.width*s),round(art.height*s)),Image.NEAREST)
    if noche:   # gradación nocturna suave (multiplicativa, fría) — el sprite exportado conserva los colores del mapa
        a=np.asarray(big).astype(float); a[...,:3]*=NOCHE; big=Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA')
    fx,fy=cam.P(x,0,z)
    # sombra de contacto
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    pts=[cam.P(x+0.42*math.cos(t),0,z+0.28*math.sin(t)) for t in np.linspace(0,2*math.pi,32)]
    d.polygon(pts,fill=(4,4,6,130)); im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.5*K)))
    ox=round(fx-AD.CX*s - s/2); oy=round(fy-AD.FEET*s)
    im.alpha_composite(big,(ox,oy))

def coloca_pantone(im,cam,art,x,z,noche=True):
    s=2*K*Z_AD/z                 # misma densidad de arte que Adonay; Pixi: scale = Z_AD/z sobre el @1x
    big=art.resize((round(art.width*s),round(art.height*s)),Image.NEAREST)
    if noche:
        a=np.asarray(big).astype(float); a[...,:3]*=NOCHE; big=Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA')
    fx,fy=cam.P(x,0,z)
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    pts=[cam.P(x+0.24*math.cos(t),0,z+0.42*math.sin(t)) for t in np.linspace(0,2*math.pi,32)]
    d.polygon(pts,fill=(4,4,6,120)); im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.5*K)))
    im.alpha_composite(big,(round(fx-PTN.CX*s-s/2),round(fy-PTN.FEET*s)))

def escena3(luz=True,frame=None,con_adonay=True,pantone='idle0'):
    cam=cam3()
    im=Image.new('RGBA',(W*K,H*K),C['bg']+(255,))
    B.sky(im); avila3(im); suelo3(im,cam)
    FA={**B.FACH,**P.FACH2}
    capa=[('f','casa-volaris',-19,ZF),('f','estudio-6x6',-4,ZF),('f','casa-bain',10.5,ZF),('f','casa-mentoria',24,ZF),
          ('f','casa-pg',-12,36),('f','casa-finoa',21.5,30),
          ('a',5,-5.2,31),('a',8,-6.4,21),('a',9,-5.6,14.5),('a',3,17.5,17)]
    for it in sorted(capa,key=lambda t:-t[3]):
        if it[0]=='f':
            lay=Image.new('RGBA',im.size,(0,0,0,0)); sx,sy=cam.P(it[2],0,it[3]); pn=B.Pn(lay,sx,sy,cam.scale(it[3])); FA[it[1]]['fn'](pn,luz)
            im.alpha_composite(B.fog_layer(lay,0.10 if it[3]>40 else 0.05))
        else: BV.place_pn(im,cam,P.arbol_c,it[2],it[3],it[1],fog=False)
    BV.place_pn(im,cam,P.banco_f,-4.3,16,fog=False)
    for z in (30.0,15.5): B.place_farol(im,cam,1.3,z,flip=False,on=luz)
    B.place_farol(im,cam,11.8,24.0,flip=True,on=luz)
    sombra_t9(im,cam); im.alpha_composite(capa_t9(cam,True))
    if pantone:
        kind,i=pantone[:-1],int(pantone[-1]); p=PTN.FRAMES[kind][i]
        coloca_pantone(im,cam,PTN.frame(p),X_AD+PT_DX,Z_AD+PT_DZ)
    if con_adonay: coloca_adonay(im,cam,sprite_adonay(frame))
    return im,cam

def export_piezas():
    rep={}
    # Adonay de espaldas: sueltos y tiras (arte ×2 = @1x, ×4 = @2x), ancla pies-centro
    for nm,frames in AD.FRAMES.items():
        strip=AD.tira(nm); s1=strip.resize((strip.width*2,strip.height*2),Image.NEAREST); BV.save_pair(s1,f'{PZ}/adonay-espalda__{nm}')
        rep[f'adonay-espalda__{nm}']=dict(w=s1.width,h=s1.height,frames=len(frames),frame_w=AD.W*2,ancla=[AD.W,AD.FEET*2],
                                         densidad_px_m=round(288/1.78,1),ambar_pct=round(B.amber_share(s1.convert('RGB'))*100,2))
    for nm,frames in PTN.FRAMES.items():
        strip=PTN.tira(nm); s1=strip.resize((strip.width*2,strip.height*2),Image.NEAREST); BV.save_pair(s1,f'{PZ}/pantone-espalda__{nm}')
        rep[f'pantone-espalda__{nm}']=dict(w=s1.width,h=s1.height,frames=len(frames),frame_w=PTN.W*2,ancla=[PTN.W,PTN.FEET*2],
                                          densidad_px_m=round(288/1.78,1),ambar_pct=round(B.amber_share(s1.convert('RGB'))*100,2))
    o2=PTN.frame(PTN.FRAMES['idle'][0]).resize((PTN.W*2,PTN.H*2),Image.NEAREST); BV.save_pair(o2,f'{PZ}/pantone-espalda')
    rep['pantone-espalda']=dict(w=o2.width,h=o2.height,ancla=[PTN.W,PTN.FEET*2],ambar_pct=round(B.amber_share(o2.convert('RGB'))*100,2))
    one=AD.personaje().resize((AD.W*2,AD.H*2),Image.NEAREST); BV.save_pair(one,f'{PZ}/adonay-espalda')
    rep['adonay-espalda']=dict(w=one.width,h=one.height,ancla=[AD.W,AD.FEET*2],ambar_pct=round(B.amber_share(one.convert('RGB'))*100,2))
    # T9 3/4 re-proyectada (solo válida para esta pose cámara↔camioneta)
    cam=cam3(); lay=capa_t9(cam); i1=BV.down(lay,W,H); bb=i1.getbbox()
    piece=i1.crop(bb)
    pa=np.asarray(piece).copy(); pa[...,3]=np.where(pa[...,3]>=128,255,0); piece=Image.fromarray(pa,'RGBA')   # borde binario: pixel-art nítido, sin franjas
    BV.save_pair(piece,f'{PZ}/jac-t9-ext__34-frontal-3p__apagado')
    fx,fy=cam.P(XS_T9,0,ZF_T9)
    rep['jac-t9-ext__34-frontal-3p__apagado']=dict(w=piece.width,h=piece.height,bbox_en_frame=list(bb),
        ancla=[round(fx/K-bb[0]),round(fy/K-bb[1])],ancla_def='esquina delantera-pasajero a nivel de suelo',
        pose=dict(nariz_z_m=ZF_T9,costado_x_m=XS_T9,cam_alto_m=CAM_H,horizonte_y=HZ3),ambar_pct=round(B.amber_share(piece.convert('RGB'))*100,2))
    return rep

if __name__=='__main__':
    BV.AVILA=Image.open(f'{PZ}/cerros-avila__tile@1x.png').convert('RGBA')
    rep={'piezas':export_piezas()}
    im,cam=escena3(); c1=BV.frame_out(im,f'{FR}/frame-c-a-pie-junto-t9')
    rep['frame-c-a-pie-junto-t9']=round(B.amber_share(c1)*100,2)
    ims,_=escena3(pantone='sit0'); ims.resize((W,H),Image.BOX).convert('RGB').save(f'{OUT}/src/_qa_frame-c3-pantone-sentado.png')
    for i,fr in enumerate(AD.FRAMES['walk']):
        imw,_=escena3(frame=fr,pantone=f'walk{i}'); imw.resize((W,H),Image.BOX).convert('RGB').save(f'{OUT}/src/_qa_frame-c3-walk{i}.png')
    f=F
    rep['camara']=dict(modo='tercera persona over-the-shoulder',alto_m=CAM_H,detras_m=round(Z_AD,3),fov_h=70,f=F,horizonte_y=HZ3,
        adonay=dict(x_m=X_AD,pies_y=round(HZ3+CAM_H*f/Z_AD,1),cabeza_y=round(HZ3-(1.78-CAM_H)*f/Z_AD,1),alto_px=round(1.78*f/Z_AD,1)),
        pantone=dict(dx_m=PT_DX,dz_m=PT_DZ,x_m=round(X_AD+PT_DX,3),z_m=round(Z_AD+PT_DZ,3),escala_pixi=round(Z_AD/(Z_AD+PT_DZ),4),
            pies_pantalla_1x=[round(640+(X_AD+PT_DX)*f/(Z_AD+PT_DZ),1),round(HZ3+CAM_H*f/(Z_AD+PT_DZ),1)],
            offset_pies_vs_adonay_1x=[round((640+(X_AD+PT_DX)*f/(Z_AD+PT_DZ))-(640+X_AD*f/Z_AD),1),round((HZ3+CAM_H*f/(Z_AD+PT_DZ))-(HZ3+CAM_H*f/Z_AD),1)],
            alto_orejas_m=round(61*1.78/144,3),alto_px=round(61*1.78/144*f/(Z_AD+PT_DZ),1)),
        t9=dict(techo_y_nariz=round(HZ3-(1.84-CAM_H)*f/ZF_T9,1),suelo_y_nariz=round(HZ3+CAM_H*f/ZF_T9,1),ancho_frente_px=round(1.96*f/ZF_T9,1),
                alto_px_frente=round(1.84*f/ZF_T9,1),ratio_altura_t9_vs_adonay=round(1.84/1.78,3)))
    json.dump(rep,open(f'{OUT}/src/frame-c.json','w'),indent=1,ensure_ascii=False); print(json.dumps(rep,indent=1,ensure_ascii=False))
