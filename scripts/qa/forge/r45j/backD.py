import json,glob,math,sys
V={'se':(1,0),'nw':(-1,0),'sw':(0,1),'ne':(0,-1)}
for f in sorted(glob.glob(sys.argv[1])):
  R=json.load(open(f)); C=R.get('cols'); F=[r for r in R['frames'] if r[8]==1]
  back=0;n=0;ex=None;run=0;worst=0
  for a,c in zip(F,F[1:]):
    dx,dy=c[2]-a[2],c[3]-a[3]; d=math.hypot(dx,dy)
    gas=(c[21] or 0)<0 or (c[20] or 0)<-0.3
    v=V[c[5]]; al=(dx*v[0]+dy*v[1])/d if d>0.02 else 0
    if c[7]=='D' and gas and al<-0.5: back+=d; n+=1; run+=d; worst=max(worst,run); ex=ex or (c[1],round(c[2],2),round(c[3],2),c[5])
    elif d>0.02: run=0
  print(f.split('/')[-1],'D+gas backward frames',n,'tiles',round(back,2),'longest run',round(worst,2),'first',ex)
