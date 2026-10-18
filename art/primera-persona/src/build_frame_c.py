# Frame C (BORRADOR): a pie (ojo 1,78 m) en la acera, recién bajado, mirando al otro lado de la calle (giro de 90°).
# La T9 está estacionada junto al brocal, lado pasajero hacia la cámara (circulación por la derecha → nariz a la derecha).
import json, os, sys, math, numpy as np
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
import build_primera_persona as B, build_v2 as BV, v2_piezas as P, v2_t9ext as T
K=B.K; W,H=B.W,B.H; C=B.C
OUT=B.OUT; PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'
# geometría (metros, cámara en x=0 mirando +z)
CURB0,CURB1=4.45,4.62          # brocal cercano
LANE=3.5; STREET1=CURB1+3*LANE # 3 canales: estacionamiento + 2
FCURB=STREET1+0.17; FSIDE=FCURB+4.0
Z_T9=914/T.D_NEAR              # 4,76 m: el lado de la T9 a escala nativa 1:1 de la pieza
X_T9=-0.62                     # centro de la T9

def suelo_c(im,cam):
    d=ImageDraw.Draw(im,'RGBA'); gp=lambda pts,f: B.gpoly(d,cam,pts,f); gl=lambda a,b,c,w=0.5: B.gline(d,cam,a,b,c,w)
    d.rectangle([0,B.HZ*K,W*K,H*K],fill=C['tileSide'])
    gp([(-300,FSIDE+3),(300,FSIDE+3),(300,B.FAR),(-300,B.FAR)],C['grass'])
    gp([(-300,FSIDE),(300,FSIDE),(300,FSIDE+3),(-300,FSIDE+3)],(21,22,26))
    gp([(-300,0),(300,0),(300,CURB0),(-300,CURB0)],C['propFace'])                 # acera cercana
    for x in np.arange(-40,40,2.0): gl((x,2.2),(x,CURB0),C['tileLine'],0.5)
    for z in np.arange(2.0,CURB0,2.0): gl((-300,z),(300,z),C['tileLine'],0.5)
    gp([(-300,CURB0),(300,CURB0),(300,CURB1),(-300,CURB1)],C['propLine'])         # brocal
    gp([(-300,CURB1),(300,CURB1),(300,STREET1),(-300,STREET1)],(22,23,27))         # asfalto
    gl((-300,CURB1+LANE),(300,CURB1+LANE),(52,55,61),0.6)                          # línea del estacionamiento
    for x in np.arange(-60,60,9.0): gl((x,CURB1+2*LANE),(x+4,CURB1+2*LANE),(120,124,132),0.9)   # eje discontinuo
    gp([(-300,STREET1),(300,STREET1),(300,FCURB),(-300,FCURB)],C['propLine'])
    gp([(-300,FCURB),(300,FCURB),(300,FSIDE),(-300,FSIDE)],C['propFace'])
    for x in np.arange(-60,60,2.0): gl((x,FCURB),(x,FSIDE),C['tileLine'],0.5)
    gl((-300,FSIDE),(300,FSIDE),C['tileLine'],0.6)

def t9_sombra(im,cam):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    B.gpoly(d,cam,[(X_T9-2.35,Z_T9+0.08),(X_T9+2.4,Z_T9+0.08),(X_T9+2.3,Z_T9+1.8),(X_T9-2.25,Z_T9+1.8)],(6,6,8,120))
    im.alpha_composite(lay)
def haz_faros(im,cam):
    """haz de los faros sobre el asfalto, hacia +x (delante de la nariz). Blanco frío, 3 bandas duras."""
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay); xn=X_T9+2.7
    for k,(L,a) in enumerate(((14,14),(9,16),(5,20))):
        B.gpoly(d,cam,[(xn,Z_T9+0.25),(xn+L,Z_T9-0.05+0.0*k),(xn+L,Z_T9+2.6+0.4*(3-k)),(xn,Z_T9+1.7)],(200,214,232,a),zmin=Z_T9-0.1)
    im.alpha_composite(lay)

def escena_c(cam,luz_calle=True,t9_luces=False):
    im=Image.new('RGBA',(W*K,H*K),C['bg']+(255,))
    B.sky(im); BV.AV_OX=900; BV.avila_layer(im); suelo_c(im,cam)
    FA={**B.FACH,**P.FACH2}
    capa=[('f','casa-volaris',-30,40),('f','casa-pg',-15,33),('f','estudio-6x6',1.5,30),('f','casa-mentoria',16,29),('f','casa-bain',30,36),
          ('a',7,8.5,FSIDE+1.5),('a',8,-9,FSIDE+2.2),('a',9,23,FSIDE+6)]
    for it in sorted(capa,key=lambda t:-t[3]):
        if it[0]=='f':
            lay=Image.new('RGBA',im.size,(0,0,0,0)); sx,sy=cam.P(it[2],0,it[3]); pn=B.Pn(lay,sx,sy,cam.scale(it[3])); FA[it[1]]['fn'](pn,luz_calle)
            im.alpha_composite(B.fog_layer(lay,0.10))
        else: BV.place_pn(im,cam,P.arbol_c,it[2],it[3],it[1],fog=False)
    for x in (-13.0,4.5,22.0): B.place_farol(im,cam,x,FCURB+0.6,flip=True,on=luz_calle)
    t9_sombra(im,cam)
    if t9_luces: haz_faros(im,cam)
    BV.place_pn(im,cam,T.t9_lado,X_T9,Z_T9,t9_luces,fog=False)
    return im

def export_t9():
    rep={}
    for k,(fn,dm) in T.T9EXT.items():
        for l in (False,True):
            nm=f"jac-t9-ext__{k}__{'luces' if l else 'apagado'}"
            w=int(math.ceil((dm['u1']-dm['u0'])*T.D_NEAR)); h=int(math.ceil(dm['v1']*T.D_NEAR))+2
            im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); pn=B.Pn(im,-dm['u0']*T.D_NEAR*K,(h-1)*K,T.D_NEAR*K); fn(pn,l)
            i1=BV.export(im,f'{PZ}/{nm}',w,h); an=[int(round(-dm['u0']*T.D_NEAR)),h-1]
            rep[nm]=dict(w=w,h=h,ancla=an,densidad=T.D_NEAR,ambar_pct=round(B.amber_share(i1)*100,2))
            # LOD a 16 px/m (BOX ×12 del render cercano: tonos promediados, sin líneas sueltas)
            w2=int(math.ceil((dm['u1']-dm['u0'])*16)); h2=int(math.ceil(dm['v1']*16))+2
            big=Image.new('RGBA',(w2*12*K,h2*12*K),(0,0,0,0)); pn=B.Pn(big,-dm['u0']*16*12*K,(h2*12-1)*K,16*12*K); fn(pn,l)
            j1=BV.down(big,w2,h2); BV.save_pair(j1,f'{PZ}/{nm}__lod16')
            rep[nm+'__lod16']=dict(w=w2,h=h2,ancla=[int(round(-dm['u0']*16)),h2-1],densidad=16,ambar_pct=round(B.amber_share(j1)*100,2))
    return rep

if __name__=='__main__':
    BV.AVILA=Image.open(f'{PZ}/cerros-avila__tile@1x.png').convert('RGBA')
    rep={'piezas':export_t9()}
    cam=B.Cam(0,1.78)
    c1=BV.frame_out(escena_c(cam),f'{FR}/frame-c-a-pie-junto-t9')
    rep['frame-c-a-pie-junto-t9']=round(B.amber_share(c1)*100,2)
    cl=escena_c(cam,True,True).resize((W,H),Image.BOX).convert('RGB'); cl.save(f'{OUT}/src/_qa_frame-c-luces.png')
    rep['frame-c__t9-luces (solo QA)']=round(B.amber_share(cl)*100,2)
    # verificación de escala: fila del techo (1,84 m) y del suelo de la T9 en pantalla
    rep['escala']=dict(z_lado_m=round(Z_T9,3),px_por_m=round(914/Z_T9,1),techo_y=round(360-(1.84-1.78)*914/Z_T9,1),suelo_y=round(360+1.78*914/Z_T9,1),
                       largo_px=round(5.33*914/Z_T9,1),alto_px=round(1.84*914/Z_T9,1))
    json.dump(rep,open(f'{OUT}/src/frame-c.json','w'),indent=1,ensure_ascii=False); print(json.dumps(rep,indent=1,ensure_ascii=False))
