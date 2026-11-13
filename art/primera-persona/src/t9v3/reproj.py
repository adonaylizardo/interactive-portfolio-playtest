"""T9 v3 → vista 3/4 en perspectiva (cámara de 3ª persona, por encima del techo).
No se redibuja la camioneta: cada cara plana del render aprobado (se.jpg, iso) se re-proyecta con una
homografía exacta (iso = afín → plano → perspectiva) a la cámara del frame. Así se conservan los píxeles,
rampas, contornos y textura del v3."""
import numpy as np, os
from PIL import Image
from modelo import iso, FACES, UN, UT, WD
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=np.asarray(Image.open(f'{HERE}/se_key.png').convert('RGBA')).copy()
# el render fuente deja ver el fondo magenta a través de los vidrios: se neutraliza a vidrio oscuro (misma luminancia)
_r,_g,_b=[SRC[...,i].astype(int) for i in range(3)]
_m=(SRC[...,3]>0)&(_r>_g+28)&(_b>_g+14)
_l=(0.3*_r+0.59*_g+0.11*_b)[_m]
SRC[_m,0]=np.clip(_l*0.92,0,255); SRC[_m,1]=np.clip(_l*0.92,0,255); SRC[_m,2]=np.clip(_l*1.12,0,255)
SU=5.33/(UN-UT); SW=1.96/WD; SV=1.84/2.0
ORDEN=['lona','techo','lado','parabrisas','capo','frente']

def mundo(q,Zf,Xs):
    u,w,v=q; return (Xs+w*SW, v*SV, Zf+(UN-u)*SU)

def homog(src4,dst4):
    """H tal que dst ~ H·src"""
    A=[]
    for (x,y),(X,Y) in zip(src4,dst4):
        A.append([x,y,1,0,0,0,-X*x,-X*y,-X]); A.append([0,0,0,x,y,1,-Y*x,-Y*y,-Y])
    _,_,vt=np.linalg.svd(np.array(A,float)); return vt[-1].reshape(3,3)

def _poly_mask(shape,pts):
    from PIL import ImageDraw
    m=Image.new('L',(shape[1],shape[0]),0); ImageDraw.Draw(m).polygon([tuple(p) for p in pts],fill=255)
    return np.asarray(m)>0

def caras_ext(name):
    f=list(FACES[name])
    if name=='lado':   # perfil completo + neumáticos
        from modelo import VF,UWS,VWS,URF,VR,UCB,VB
        f=[(UT-0.03,0,-0.03),(UN+0.02,0,-0.03),(UN+0.02,0,VF),(UWS,0,VWS),(URF,0,VR),(UCB,0,VR),(UCB,0,VB),(UT-0.03,0,VB)]
    if name=='frente':
        f=[(UN,-0.02,-0.03),(UN,WD+0.02,-0.03),(UN,WD+0.02,f[2][2]),(UN,-0.02,f[3][2])]
    return f

def render(P,size,Zf,Xs,ss=1):
    """P(x,y,z)->(px,py) en el lienzo destino (ya supersampleado). Devuelve capa RGBA de tamaño size."""
    out=np.zeros((size[1],size[0],4),np.uint8)
    for name in ORDEN:
        f=caras_ext(name)
        dst=[P(*mundo(q,Zf,Xs)) for q in f]
        src=[tuple(iso(*q)) for q in f]
        # 4 puntos del plano para la homografía
        if name=='lado': base=[(UT,0,0),(UN,0,0),(UN,0,2),(UT,0,2)]
        elif name=='frente': base=[(UN,0,0),(UN,WD,0),(UN,WD,1),(UN,0,1)]
        else: base=f[:4]
        Hm=homog([P(*mundo(q,Zf,Xs)) for q in base],[tuple(iso(*q)) for q in base])
        m=_poly_mask(out.shape,dst)
        ys,xs=np.nonzero(m)
        if len(xs)==0: continue
        v=Hm@np.vstack([xs+0.5,ys+0.5,np.ones_like(xs,float)])
        sx=(v[0]/v[2]); sy=(v[1]/v[2])
        ix=np.clip(np.floor(sx).astype(int),0,SRC.shape[1]-1); iy=np.clip(np.floor(sy).astype(int),0,SRC.shape[0]-1)
        px=SRC[iy,ix]; ok=px[:,3]>0
        cur=out[ys[ok],xs[ok]]; a=px[ok,3:4]/255.0
        out[ys[ok],xs[ok],:3]=(px[ok,:3]*a+cur[:,:3]*(1-a)).astype(np.uint8)
        out[ys[ok],xs[ok],3]=np.maximum(cur[:,3],px[ok,3])
    return Image.fromarray(out,'RGBA')
