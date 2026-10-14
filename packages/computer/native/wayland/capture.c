// SPDX-License-Identifier: MIT
// Opt-in wlr-screencopy v3 producer. PNG and source time are one NDJSON message.
// ready is a compositor capture/commit timestamp, NOT a physical page flip.
#define _GNU_SOURCE
#include <wayland-client.h>
#include <png.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include "screencopy-client.h"

static struct wl_display *display;
static struct wl_shm *shm;
static struct wl_output *output;
static struct zwlr_screencopy_manager_v1 *manager;
static struct zwlr_screencopy_frame_v1 *frame;
static struct wl_buffer *buffer;
static void *pixels;
static size_t pixel_bytes;
static uint32_t width, height, stride, format, flags;
static uint64_t requested, sequence;
static int verify_monotonic, finished, output_index, output_seen;
static int region[4], has_region;
static int adaptive_filter, trace;
static char boot[80], clock_id[160];
static void fail(const char *s) { fprintf(stderr, "wayland-capture: %s\n", s); exit(1); }
static uint64_t mono(void) { struct timespec t; if(clock_gettime(CLOCK_MONOTONIC,&t)) fail("clock_gettime"); return (uint64_t)t.tv_sec*1000000000+t.tv_nsec; }
static void request_frame(void);
struct bytes { unsigned char *data; size_t size, capacity; };
static void png_write(png_structp p, png_bytep data, png_size_t size) {
  struct bytes *b=png_get_io_ptr(p);
  if(b->size+size > b->capacity) { b->capacity=(b->size+size)*2; void *n=realloc(b->data,b->capacity); if(!n) png_error(p,"allocation"); b->data=n; }
  memcpy(b->data+b->size,data,size); b->size+=size;
}
static void png_flush(png_structp p) { (void)p; }
static void base64(const unsigned char *p,size_t n) {
  static const char c[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for(size_t i=0;i<n;i+=3) { uint32_t v=(uint32_t)p[i]<<16; if(i+1<n)v|=(uint32_t)p[i+1]<<8; if(i+2<n)v|=p[i+2];
    putchar(c[(v>>18)&63]);putchar(c[(v>>12)&63]);putchar(i+1<n?c[(v>>6)&63]:'=');putchar(i+2<n?c[v&63]:'='); }
}
static void on_buffer(void *data,struct zwlr_screencopy_frame_v1 *f,uint32_t fmt,uint32_t w,uint32_t h,uint32_t st) {
  (void)data;(void)f;
  if(fmt!=WL_SHM_FORMAT_XRGB8888 && fmt!=WL_SHM_FORMAT_ARGB8888) fail("unsupported pixel format");
  if(!w || !h || w>16384 || h>16384 || st<w*4 || (uint64_t)st*h>256*1024*1024) fail("invalid image dimensions");
  format=fmt;width=w;height=h;stride=st;pixel_bytes=(size_t)st*h;
  int fd=(int)syscall(SYS_memfd_create,"midscene-frame",1);
  if(fd<0 || ftruncate(fd,(off_t)pixel_bytes)) fail("shared memory allocation");
  pixels=mmap(NULL,pixel_bytes,PROT_READ|PROT_WRITE,MAP_SHARED,fd,0);if(pixels==MAP_FAILED)fail("mmap");
  struct wl_shm_pool *pool=wl_shm_create_pool(shm,fd,(int32_t)pixel_bytes);
  buffer=wl_shm_pool_create_buffer(pool,0,(int32_t)w,(int32_t)h,(int32_t)st,fmt);wl_shm_pool_destroy(pool);close(fd);
}
static void on_flags(void *data,struct zwlr_screencopy_frame_v1 *f,uint32_t v) { (void)data;(void)f;flags=v; }
static struct bytes encode_png(void) {
  struct bytes b={0};png_structp p=png_create_write_struct(PNG_LIBPNG_VER_STRING,NULL,NULL,NULL);if(!p)fail("png allocation");
  png_infop info=png_create_info_struct(p);if(!info)fail("png info");
  if(setjmp(png_jmpbuf(p)))fail("PNG encoding failed");
  png_set_write_fn(p,&b,png_write,png_flush);png_set_compression_level(p,1);
  // Adaptive filter search dominates full-screen encoding and delays the next capture.
  // NONE remains lossless; adaptive is retained only for controlled A/B measurements.
  if(!adaptive_filter)png_set_filter(p,PNG_FILTER_TYPE_BASE,PNG_FILTER_NONE);
  png_set_IHDR(p,info,width,height,8,PNG_COLOR_TYPE_RGB,PNG_INTERLACE_NONE,PNG_COMPRESSION_TYPE_DEFAULT,PNG_FILTER_TYPE_DEFAULT);png_write_info(p,info);
  unsigned char *row=malloc((size_t)width*3);if(!row)fail("row allocation");
  for(uint32_t y=0;y<height;y++) { uint32_t sy=(flags & ZWLR_SCREENCOPY_FRAME_V1_FLAGS_Y_INVERT)?height-1-y:y; unsigned char *src=(unsigned char*)pixels+(size_t)sy*stride;
    for(uint32_t x=0;x<width;x++){row[x*3]=src[x*4+2];row[x*3+1]=src[x*4+1];row[x*3+2]=src[x*4];} png_write_row(p,row); }
  free(row);png_write_end(p,NULL);png_destroy_write_struct(&p,&info);
  return b;
}
static void on_ready(void *data,struct zwlr_screencopy_frame_v1 *f,uint32_t hi,uint32_t lo,uint32_t ns) {
  (void)data;
  uint64_t received=mono(),stamp=(((uint64_t)hi<<32)|lo)*1000000000+ns;
  if(ns>=1000000000)fail("invalid source timestamp");
  // Opt-in alignment assertion, backed by compositor-specific source review.
  // Never remap a foreign clock or replace source time with encoding/arrival time.
  if(verify_monotonic && (stamp<requested || stamp>received))fail("source timestamp outside CLOCK_MONOTONIC capture bounds");
  struct bytes b=encode_png();
  uint64_t encoded=mono();
  ++sequence;
  // Persist source identity before emitting a frame, including when the consumer stops immediately.
  if(trace) {
    fprintf(stderr,"{\"frameId\":\"%ld-%llu\",\"sourceNs\":\"%llu\",\"requestedNs\":\"%llu\",\"readyNs\":\"%llu\",\"encodedNs\":\"%llu\",\"pngBytes\":%zu,\"adaptiveFilter\":%s}\n",(long)getpid(),(unsigned long long)sequence,(unsigned long long)stamp,(unsigned long long)requested,(unsigned long long)received,(unsigned long long)encoded,b.size,adaptive_filter?"true":"false");
    if(fflush(stderr) || ferror(stderr))fail("trace output closed");
  }
  printf("{\"version\":1,\"frameId\":\"%ld-%llu\",\"width\":%u,\"height\":%u,\"timing\":{\"clockId\":\"%s\",\"kind\":\"compositor-frame\",\"startMs\":%.6f,\"endMs\":%.6f},\"captureStartNs\":\"%llu\",\"readyNs\":\"%llu\",\"pngEncodedNs\":\"%llu\",\"pngBase64\":\"",(long)getpid(),(unsigned long long)sequence,width,height,clock_id,stamp/1e6-0.001,stamp/1e6+0.001,(unsigned long long)requested,(unsigned long long)received,(unsigned long long)encoded);
  base64(b.data,b.size);printf("\"}\n");if(fflush(stdout) || ferror(stdout))fail("frame output closed");
  if(trace) {
    fprintf(stderr,"{\"frameId\":\"%ld-%llu\",\"sourceNs\":\"%llu\",\"requestedNs\":\"%llu\",\"readyNs\":\"%llu\",\"encodedNs\":\"%llu\",\"emittedNs\":\"%llu\",\"pngBytes\":%zu,\"adaptiveFilter\":%s}\n",(long)getpid(),(unsigned long long)sequence,(unsigned long long)stamp,(unsigned long long)requested,(unsigned long long)received,(unsigned long long)encoded,(unsigned long long)mono(),b.size,adaptive_filter?"true":"false");
    if(fflush(stderr) || ferror(stderr))fail("trace output closed");
  }
  free(b.data);
  zwlr_screencopy_frame_v1_destroy(f);frame=NULL;wl_buffer_destroy(buffer);buffer=NULL;munmap(pixels,pixel_bytes);pixels=NULL;
  if(!finished)request_frame();
}
static void on_failed(void *d,struct zwlr_screencopy_frame_v1 *f){(void)d;(void)f;fail("compositor could not copy frame");}
static void on_damage(void *d,struct zwlr_screencopy_frame_v1 *f,uint32_t x,uint32_t y,uint32_t w,uint32_t h){(void)d;(void)f;(void)x;(void)y;(void)w;(void)h;}
static void on_dmabuf(void *d,struct zwlr_screencopy_frame_v1 *f,uint32_t fmt,uint32_t w,uint32_t h){(void)d;(void)f;(void)fmt;(void)w;(void)h;}
static void on_done(void *d,struct zwlr_screencopy_frame_v1 *f){(void)d;if(!buffer)fail("no supported shared memory buffer");zwlr_screencopy_frame_v1_copy(f,buffer);}
static const struct zwlr_screencopy_frame_v1_listener listener={on_buffer,on_flags,on_ready,on_failed,on_damage,on_dmabuf,on_done};
static void request_frame(void){flags=0;requested=mono();frame=has_region?zwlr_screencopy_manager_v1_capture_output_region(manager,0,output,region[0],region[1],region[2],region[3]):zwlr_screencopy_manager_v1_capture_output(manager,0,output);zwlr_screencopy_frame_v1_add_listener(frame,&listener,NULL);}
static void geometry(void*d,struct wl_output*o,int32_t x,int32_t y,int32_t w,int32_t h,int32_t sp,const char*m,const char*model,int32_t tr){(void)d;(void)o;(void)x;(void)y;(void)w;(void)h;(void)sp;(void)m;(void)model;(void)tr;}
static void mode(void*d,struct wl_output*o,uint32_t f,int32_t w,int32_t h,int32_t r){(void)d;(void)o;(void)f;(void)w;(void)h;(void)r;}
static const struct wl_output_listener output_listener={.geometry=geometry,.mode=mode};
static void global(void*d,struct wl_registry*r,uint32_t name,const char*iface,uint32_t version){(void)d;
  if(!strcmp(iface,"wl_shm"))shm=wl_registry_bind(r,name,&wl_shm_interface,1);
  else if(!strcmp(iface,"wl_output") && output_seen++==output_index){output=wl_registry_bind(r,name,&wl_output_interface,1);wl_output_add_listener(output,&output_listener,NULL);}
  else if(!strcmp(iface,"zwlr_screencopy_manager_v1") && version>=3)manager=wl_registry_bind(r,name,&zwlr_screencopy_manager_v1_interface,3);
}
static void removed(void*d,struct wl_registry*r,uint32_t n){(void)d;(void)r;(void)n;}
int main(int argc,char**argv){
  for(int i=1;i<argc;i++){if(!strcmp(argv[i],"--verify-monotonic"))verify_monotonic=1;
    else if(!strcmp(argv[i],"--trace"))trace=1;
    else if(!strcmp(argv[i],"--png-filter") && i+1<argc){const char *v=argv[++i];if(!strcmp(v,"adaptive"))adaptive_filter=1;else if(!strcmp(v,"none"))adaptive_filter=0;else fail("invalid PNG filter");}
    else if(!strcmp(argv[i],"--output-index") && i+1<argc)output_index=atoi(argv[++i]);
    else if(!strcmp(argv[i],"--region") && i+1<argc){if(sscanf(argv[++i],"%d,%d,%d,%d",&region[0],&region[1],&region[2],&region[3])!=4 || region[0]<0 || region[1]<0 || region[2]<=0 || region[3]<=0)fail("invalid region");has_region=1;}
    else fail("usage: capture [--verify-monotonic] [--output-index N] [--region x,y,w,h] [--png-filter none|adaptive] [--trace]");}
  FILE *b=fopen("/proc/sys/kernel/random/boot_id","r");if(!b || !fgets(boot,sizeof boot,b))fail("boot clock identity unavailable");fclose(b);boot[strcspn(boot,"\r\n")]=0;
  if(verify_monotonic)snprintf(clock_id,sizeof clock_id,"linux-monotonic:%s",boot);
  else snprintf(clock_id,sizeof clock_id,"wayland-screencopy:%s:%ld",boot,(long)getpid());
  display=wl_display_connect(NULL);if(!display)fail("Wayland display unavailable");struct wl_registry*r=wl_display_get_registry(display);static const struct wl_registry_listener reg={global,removed};wl_registry_add_listener(r,&reg,NULL);if(wl_display_roundtrip(display)<0 || !shm || !output || !manager)fail("wlr-screencopy v3, wl_shm and selected output required");
  request_frame();while(wl_display_dispatch(display)>=0){}fail("Wayland stream disconnected");return 1;
}
