var folderMapping=false;

function translatePath(path){
    if(path.startsWith('//') && process.platform!='win32')
    {
        path=path.substring(2).replace(/\//g, $('path').sep);
        var indexOfSlash=path.indexOf($('path').sep);
        path=path.substring(0,indexOfSlash)+':'+path.substring(indexOfSlash);
        if(!folderMapping)
        {
            folderMapping={};
            var fstab=$('fs').readFileSync('/etc/fstab', 'ascii');
            var declarations=fstab.split(/\n/g);
            $.each(declarations, function(index, line){
                var declaration=line.split(/[ \t]/g);
                if(typeof(line)!='undefined' && declaration.length>1)
                {
                    folderMapping[declaration[0]]=declaration[1]
                }
            });
            console.log(folderMapping);
        }
        $.each(folderMapping, function(remotePath, localPath){
            if(path.startsWith(remotePath))
                path=path.replace(remotePath, localPath);
        });
    }
    return path;
}

module.exports={
    get:function(db, id, callback){
        var res=this.response;
        db.hget(id, 'path', function(err, path){
            if(err)
                console.log(err);
            path=path.substring('file:///'.length);
            
            if(path.endsWith('.m4a'))
                res.setHeader('content-type', 'audio/mp4');
            else
                res.setHeader('content-type', 'audio/mpeg');
            
            path=translatePath(path);
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