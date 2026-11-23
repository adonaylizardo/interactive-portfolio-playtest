# Modelo 3D simplificado de la T9 v3 en unidades del render fuente (se.jpg) + afinidad iso medida.
import numpy as np
O=np.array([532.7,517.0]); A=np.array([116.7,55.7]); Bv=np.array([0.0,-154.0]); Cw=np.array([120.3,-34.0])
def iso(u,w,v): return O+u*A+w*Cw+v*Bv
WD=1.97; UN=2.15; VF=1.32; UWS,VWS=1.47,1.44; URF,VR=0.95,2.0; UCB=-0.70; VB=1.37; UT=-2.46; WI=0.14
FACES={
 'lado':   [(UT,0,0.25),(UN,0,0.25),(UN,0,VF),(UWS,0,VWS),(URF,0,VR),(UCB,0,VR),(UCB,0,VB),(UT,0,VB)],
 'frente': [(UN,0,0.25),(UN,WD,0.25),(UN,WD,VF),(UN,0,VF)],
 'capo':   [(UN,0,VF),(UN,WD,VF),(UWS,WD,VWS),(UWS,0,VWS)],
 'parabrisas':[(UWS,0.10,VWS),(UWS,1.55,VWS),(URF,1.32,VR),(URF,0.16,VR)],
 'techo':  [(URF,0.16,VR),(URF,1.32,VR),(UCB,1.32,VR),(UCB,0.16,VR)],
 'lona':   [(UCB,0,VB),(UCB,WD,VB),(UT,WD,VB),(UT,0,VB)],
}
