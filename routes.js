route.on('media/*', function(url, params, unchanged){
    $.ajax(loadHtml('/media/'+params.wildcard, function(){
        page.preFilter=params.wildcard;
    })); 
});

route.on('media', function(url, params, unchanged){
    $.ajax(loadHtml('/media')); 
});