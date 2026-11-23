# Recorta la T9 v3 de su render fuente aprobado (/workspace/jac3/se.jpg, fondo magenta) con el mismo criterio de key.py de v3.
import numpy as np
from PIL import Image
from scipy import ndimage as nd
def key(path):
    a=np.array(Image.open(path).convert('RGB')).astype(float); r,g,b=a[...,0],a[...,1],a[...,2]
    s=np.minimum(r,b*1.6)-g; cand=s>45
    lab,n=nd.label(cand); border=set(np.unique(np.r_[lab[0],lab[-1],lab[:,0],lab[:,-1]]))-{0}
    bg=np.isin(lab,list(border)); bg=nd.binary_opening(bg,iterations=1)|bg
    near=nd.binary_dilation(bg,iterations=3)&~bg
    al=np.where(bg,0.0,1.0); al[near]=np.clip(1-(s[near]-15)/80,0,1)
    sp=near|(nd.binary_dilation(bg,iterations=6)&(s>8))
    r2=np.where(sp,np.minimum(r,g+10),r); b2=np.where(sp,np.minimum(b,g+14),b)
    out=np.dstack([r2,g,b2,al*255]).clip(0,255).astype(np.uint8)
    return Image.fromarray(out,'RGBA')
if __name__=='__main__':
    key('/workspace/jac3/se.jpg').save('se_key.png')
