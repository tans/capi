package ops

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func Backup(ctx context.Context,cfg config.Config,st *store.Store)(string,error){
	root:=filepath.Join(cfg.DataDir,"backups");stamp:=time.Now().UTC().Format("20060102T150405Z");dst:=filepath.Join(root,stamp)
	if err:=os.MkdirAll(dst,0o700);err!=nil{return "",err}
	dbdst:=filepath.Join(dst,"capi.sqlite");escaped:=strings.ReplaceAll(dbdst,"'","''")
	if _,err:=st.DB.ExecContext(ctx,fmt.Sprintf("VACUUM INTO '%s'",escaped));err!=nil{return "",err}
	if _,err:=os.Stat(cfg.FilesDir);err==nil{if err:=copyDir(cfg.FilesDir,filepath.Join(dst,"files"));err!=nil{return "",err}}
	entries,err:=os.ReadDir(root);if err==nil{var dirs []string;for _,e:=range entries{if e.IsDir(){dirs=append(dirs,e.Name())}};sort.Sort(sort.Reverse(sort.StringSlice(dirs)));for _,name:=range dirs[capped(cfg.BackupRetention,len(dirs)):] {_=os.RemoveAll(filepath.Join(root,name))}}
	return dst,nil
}
func capped(n,total int)int{if n<0{return 0};if n>total{return total};return n}
func copyDir(src,dst string)error{return filepath.Walk(src,func(path string,info os.FileInfo,err error)error{if err!=nil{return err};rel,_:=filepath.Rel(src,path);target:=filepath.Join(dst,rel);if info.IsDir(){return os.MkdirAll(target,info.Mode())};in,err:=os.Open(path);if err!=nil{return err};defer in.Close();out,err:=os.OpenFile(target,os.O_CREATE|os.O_WRONLY|os.O_TRUNC,info.Mode());if err!=nil{return err};_,cpErr:=io.Copy(out,in);closeErr:=out.Close();if cpErr!=nil{return cpErr};return closeErr})}
