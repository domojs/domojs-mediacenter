module.exports={
    get:function(id, callback){
        var res=this.response;
        $.db.hget(id, 'path', function(err, path){
            if(err)
                console.log(err);
            path=path.substring('file:///'.length);
            if(path.endsWith('.m4a'))
                res.setHeader('content-type', 'audio/mp4');
            else
                res.setHeader('content-type', 'audio/mpeg');
            
            console.log(path);
            var readStream=$('fs').createReadStream(path);
            // This will wait until we know the readable stream is actually valid before piping
            readStream.on('open', function () {
                // This just pipes the read stream to the response object (which goes to the client)
                readStream.pipe(res);
            });
            
            // This catches any errors that happen while creating the readable stream (usually invalid names)
            readStream.on('error', function(err) {
                res.end(err);
            });
            
            readStream.on('end', function(){
                res.end();
            });
        });
    }
};