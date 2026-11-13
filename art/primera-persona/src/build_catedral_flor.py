# Re-exporta SOLO las fachadas Catedral y Flor (v3, desde fotos reales) y re-renderiza SOLO el frame A (usa la Catedral).
# No toca ninguna otra pieza. Actualiza solo esas entradas en ambar-v2.json y qa-v2.json (relee antes de escribir).
import json, os, sys
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import build_primera_persona as B, v2_piezas as P, build_v2 as BV
OUT=B.OUT; PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'; K=B.K
KEYS=('catedral-de-barquisimeto','flor-de-venezuela')
def halo(i1,s4):
    a1=np.asarray(i1).astype(float); w,h=i1.size
    a4=np.asarray(s4).astype(float)[:h*K,:w*K].reshape(h,K,w,K,4).transpose(0,2,1,3,4).reshape(h,w,K*K,4)
    lum4=a4[...,:3]@np.array([0.3,0.59,0.11]); mn=np.where(a4[...,3]>0,lum4,1e9).min(-1)
    part=(a1[...,3]>0)&(a1[...,3]<255); n=int(part.sum())
    lum1=a1[...,:3]@np.array([0.3,0.59,0.11]); bad=part&(lum1<mn-3)
    return n,(round(100*bad.sum()/n,2) if n else 0.0)
if __name__=='__main__':
    rep={}; qa={}
    for key in KEYS:
        for luz in (True,False):
            im,w,h,an=BV.render_fachada(key,luz); nm=f"fachada-{key}__luz-{'encendida' if luz else 'apagada'}"
            i1=BV.export(im,f'{PZ}/{nm}',w,h)
            a=np.asarray(i1); tot=round(100*B.amber_share(i1),2)
            r,g,b,al=[a[...,i].astype(int) for i in range(4)]; amb=(al>20)&(r>90)&(r-b>55)&(g>b)&(r>=g)
            rep[nm]=dict(w=w,h=h,ancla=an,ambar_pct=tot)
            n,hp=halo(i1,im); qa[nm]=dict(ambar_pct=tot,ambar_pct_lienzo_total=round(100*amb.sum()/(w*h),2),borde_px=n,halo_pct=hp)
            print(nm,w,h,an,'ámbar',tot,'% (opacos) /',qa[nm]['ambar_pct_lienzo_total'],'% (lienzo) · halo',hp,'% de',n)
    # frame A: misma escena v2; el Ávila se lee del tile ya exportado (no se regenera)
    BV.AVILA=Image.open(f'{PZ}/cerros-avila__tile@1x.png').convert('RGBA')
    a1=BV.frame_out(BV.escena2(B.Cam(7.2,1.78),True),f'{FR}/frame-a-a-pie'); fa=round(B.amber_share(a1)*100,2); print('frame A ámbar',fa)
    BV.escena2(B.Cam(7.2,1.78),False).resize((B.W,B.H),Image.BOX).convert('RGB').save('/tmp/frame-a-off.png')
    # actualizar SOLO estas entradas (releer justo antes de escribir)
    p=f'{OUT}/src/ambar-v2.json'; R=json.load(open(p)); R['piezas'].update(rep); R['frames']['frame-a-a-pie']=fa
    json.dump(R,open(p,'w'),indent=1,ensure_ascii=False)
    p=f'{OUT}/src/qa-v2.json'; Q=json.load(open(p)); Q.update(qa); json.dump(Q,open(p,'w'),indent=1,ensure_ascii=False)
    json.dump(dict(piezas=rep,qa=qa,frame_a=fa),open('/tmp/catflor-rep.json','w'),indent=1,ensure_ascii=False)
