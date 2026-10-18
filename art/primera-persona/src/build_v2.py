# Primera persona v2 (BORRADOR) · orquesta: cabina real del T9, volante suelto, fachadas nuevas, props, Ávila, suelos, frames A/B.
# Exportación: lienzo ×4 → @1x con BOX (alfa premultiplicado, sin halos) → @2x = @1x ×2 NEAREST.
import json, math, os, sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
import build_primera_persona as B, v2_cabina as V, v2_piezas as P
OUT=B.OUT; FP=B.FP; K=B.K; W,H=B.W,B.H; PPM=B.PPM
PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'

def save_pair(i1,base):
    i1.save(f'{base}@1x.png'); i1.resize((i1.width*2,i1.height*2),Image.NEAREST).save(f'{base}@2x.png')
def down(im4,w,h):
    """BOX exacto en float con alfa premultiplicado (sin el redondeo de 8 bits de Pillow → cero halos)."""
    if im4.mode!='RGBA': return im4.resize((w,h),Image.BOX)
    k=im4.width//w; a=np.asarray(im4).astype(np.float64)[:h*k,:w*k]
    al=a[...,3:4]/255.0; pm=np.concatenate([a[...,:3]*al,al],-1).reshape(h,k,w,k,4).mean((1,3))
    A=pm[...,3:4]; rgb=np.where(A>0,pm[...,:3]/np.maximum(A,1e-9),0)
    out=np.concatenate([np.clip(np.round(rgb),0,255),np.round(A*255)],-1).astype(np.uint8)
    out[out[...,3]<8]=0
    return Image.fromarray(out,'RGBA')
def export(im4,base,w,h): i1=down(im4,w,h); save_pair(i1,base); return i1

FACH_ALL=dict(B.FACH); FACH_ALL.update(P.FACH2)
def render_fachada(key,luz):
    f=FACH_ALL[key]; w=int(math.ceil((f['u1']-f['u0'])*PPM)); h=int(math.ceil(f['v1']*PPM))+2
    im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); pn=B.Pn(im,-f['u0']*PPM*K,(h-1)*K,PPM*K); f['fn'](pn,luz)
    return im,w,h,[int(round(-f['u0']*PPM)),h-1]
def render_pn(fn,u0,u1,v1,*a):
    w=int(math.ceil((u1-u0)*PPM)); h=int(math.ceil(v1*PPM))+2
    im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); pn=B.Pn(im,-u0*PPM*K,(h-1)*K,PPM*K); fn(pn,*a)
    return im,w,h,[int(round(-u0*PPM)),h-1]

# ---------- escena compartida (misma calle que v1; cambian las piezas compartidas: Ávila tile, árbol C, banco) ----------
AVILA=None; AV_OX=300
def avila_layer(im):
    t=AVILA; row=np.asarray(t)
    cols=[(AV_OX+i)%P.AV_W for i in range(W)]
    crop=Image.fromarray(row[:,cols],'RGBA').resize((W*K,P.AV_H*K),Image.NEAREST)
    lay=Image.new('RGBA',im.size,(0,0,0,0)); lay.paste(crop,(0,(362-P.AV_H)*K)); im.alpha_composite(lay)
def place_pn(im,cam,fn,x,z,*a,fog=True):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); sx,sy=cam.P(x,0,z); pn=B.Pn(lay,sx,sy,cam.scale(z)); fn(pn,*a)
    im.alpha_composite(B.fog_layer(lay,min(0.28,max(0,(z-40)/220))) if fog else lay)
def escena2(cam,luz=True,headlights=None):
    im=Image.new('RGBA',(W*K,H*K),B.C['bg']+(255,))
    B.sky(im); avila_layer(im); B.suelo(im,cam)
    if headlights:
        lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
        for hx in headlights:
            for k in range(8,0,-1):
                f=k/8
                pts=[cam.P(hx-0.6*f-0.06*(z-3),0,z) for z in np.linspace(3,3+20*f,10)]+[cam.P(hx+0.6*f+0.06*(z-3),0,z) for z in np.linspace(3+20*f,3,10)]
                d.polygon(pts,fill=(205,206,200,int(16*(1-f))+3))
        im.alpha_composite(lay)
    capa=[('f','teresa-carreno',14,128),('f','catedral-de-barquisimeto',76,150),('f','biblioteca-ingenieria',-21,62),
          ('a',4,40,100),('a',5,-40,52),('a',6,25,56)]
    for it in sorted(capa,key=lambda t:-t[3]):
        if it[0]=='f': B.place_fachada(im,cam,it[1],it[2],it[3],luz)
        else: place_pn(im,cam,P.arbol_c,it[2],it[3],it[1])
    B.seto(im,cam,-300,-10,B.ZX0-0.4); B.seto(im,cam,10,300,B.ZX0-0.4)
    for z in (40,22): B.place_farol(im,cam,-9.6,z,flip=False)
    for z in (38,22): B.place_farol(im,cam,10.0,z,flip=True)
    place_pn(im,cam,P.banco_f,10.6,13,fog=False); place_pn(im,cam,P.banco_f,-10.6,17,fog=False)
    for x in (-12,12): B.place_farol(im,cam,x,46.5,flip=(x>0))
    return im

def frame_out(im4,base):
    i1=im4.resize((W,H),Image.BOX).convert('RGB'); save_pair(i1,base); return i1

if __name__=='__main__':
    os.makedirs(PZ,exist_ok=True); os.makedirs(FR,exist_ok=True)
    rep={'frames':{},'piezas':{}}
    # Ávila
    av4,xm=P.avila_tile(); AVILA=down(av4,P.AV_W,P.AV_H); save_pair(AVILA,f'{PZ}/cerros-avila__tile')
    rep['piezas']['cerros-avila__tile']=dict(w=P.AV_W,h=P.AV_H,ancla=[0,P.AV_H-2],ambar_pct=round(B.amber_share(AVILA)*100,2),humboldt_x=xm)
    # frame A (re-render: comparten Ávila, árbol, banco)
    camA=B.Cam(7.2,1.78); a1=frame_out(escena2(camA,True),f'{FR}/frame-a-a-pie'); rep['frames']['frame-a-a-pie']=round(B.amber_share(a1)*100,2)
    # frame B: escena + capó + cabina (luces on) + volante
    xc=2.6; camB=B.Cam(xc-0.37,1.45)
    fb=escena2(camB,True,headlights=[xc-0.75,xc+0.75]); B.capo(fb,camB,xc)
    cp=Image.new('RGBA',(W*K,H*K),(0,0,0,0)); B.capo(cp,camB,xc); c1=export(cp,f'{PZ}/jac-t9-capo',W,H)
    rep['piezas']['jac-t9-capo']=dict(w=W,h=H,ancla=[0,0],ambar_pct=round(B.amber_share(c1)*100,2))
    for luces,tag in ((True,'luces-on'),(False,'luces-off')):
        cab=V.cabina2(luces); i1=export(cab,f'{PZ}/jac-t9-cabina__{tag}',W,H)
        rep['piezas'][f'jac-t9-cabina__{tag}']=dict(w=W,h=H,ancla=[0,0],ambar_pct=round(B.amber_share(i1)*100,2))
        if luces: fb.alpha_composite(cab)
    wh=V.volante(); w1=export(wh,f'{PZ}/jac-t9-volante',*V.WCAN)
    rep['piezas']['jac-t9-volante']=dict(w=V.WCAN[0],h=V.WCAN[1],ancla=list(V.WHUB),pos_pantalla_1x=list(V.WHEEL_POS),ambar_pct=round(B.amber_share(w1)*100,2))
    lay=Image.new('RGBA',fb.size,(0,0,0,0)); lay.paste(wh,((V.WHEEL_POS[0]-V.WHUB[0])*K,(V.WHEEL_POS[1]-V.WHUB[1])*K)); fb.alpha_composite(lay)
    b1=frame_out(fb,f'{FR}/frame-b-jac-t9'); rep['frames']['frame-b-jac-t9']=round(B.amber_share(b1)*100,2)
    # cabina apagada compuesta (solo para QA, no es entregable de runtime)
    fo=escena2(camB,False); B.capo(fo,camB,xc); fo.alpha_composite(V.cabina2(False)); fo.alpha_composite(lay)
    fo.resize((W,H),Image.BOX).convert('RGB').save('/tmp/frame-b-off.png')
    # fachadas (todas, viejas re-exportadas + nuevas)
    for key in FACH_ALL:
        for luz in (True,False):
            im,w,h,an=render_fachada(key,luz); nm=f"fachada-{key}__luz-{'encendida' if luz else 'apagada'}"
            i1=export(im,f'{PZ}/{nm}',w,h); rep['piezas'][nm]=dict(w=w,h=h,ancla=an,ambar_pct=round(B.amber_share(i1)*100,2))
    # props
    for nm,(fn,dims,args) in {'arbol-cuji-frente':(P.arbol_c,P.ARBOL,(5,)),'banco-frente':(P.banco_f,P.BANCO,())}.items():
        im,w,h,an=render_pn(fn,dims['u0'],dims['u1'],dims['v1'],*args); i1=export(im,f'{PZ}/{nm}',w,h)
        rep['piezas'][nm]=dict(w=w,h=h,ancla=an,ambar_pct=round(B.amber_share(i1)*100,2))
    w,h=24,76; im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); pn=B.Pn(im,6*K,(h-1)*K,PPM*K); B.farol(pn,True)
    i1=export(im,f'{PZ}/farol-frente__estado-encendido',w,h); rep['piezas']['farol-frente__estado-encendido']=dict(w=w,h=h,ancla=[6,h-1],ambar_pct=round(B.amber_share(i1)*100,2))
    # suelos
    for nm,(fn,nota) in P.STRIPS.items():
        i1=P.strip(fn); save_pair(i1,f'{PZ}/{nm}'); rep['piezas'][nm]=dict(w=512,h=8,ancla=[256,0],ambar_pct=0.0)
    pc=P.planta_cruce(); save_pair(pc,f'{PZ}/suelo-cruce__planta'); rep['piezas']['suelo-cruce__planta']=dict(w=pc.width,h=pc.height,ancla=[256,256],ambar_pct=0.0)
    pp=P.planta_plaza(); save_pair(pp,f'{PZ}/suelo-plaza__planta'); rep['piezas']['suelo-plaza__planta']=dict(w=pp.width,h=pp.height,ancla=[0,0],ambar_pct=0.0)
    json.dump(P.CRUCE_SPEC,open(f'{PZ}/suelo-cruce__spec.json','w'),ensure_ascii=False,indent=1)
    for nm in ('cielo-noche__tile','suelo-avenida__fase-a','suelo-avenida__fase-b'):
        i1=Image.open(f'{PZ}/{nm}@1x.png'); rep['piezas'][nm]=dict(w=i1.width,h=i1.height,ancla=[0,360] if 'cielo' in nm else [256,0],ambar_pct=round(B.amber_share(i1)*100,2))
    json.dump(rep,open(f'{OUT}/src/ambar-v2.json','w'),indent=1,ensure_ascii=False)
    print(json.dumps(rep['frames'])); print(json.dumps({k:(v['w'],v['h'],v['ambar_pct']) for k,v in rep['piezas'].items()},ensure_ascii=False,indent=0))
