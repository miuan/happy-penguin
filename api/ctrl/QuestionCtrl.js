var Async = require('async')
    ,questionEngine = require(process.cwd() + '/engine/question.js');
var pg = null;

module.exports = {

    // init
    $init : function(server, Hapi){
        pg = server.pgClient;

    },
    // get Hapi Config
    $getConfig : function(){
        return {
            auth : 'passport'
            ,params : '{params*}'

        }
    },setstate_post : function(request){


        var params = request.params.params.split('/');



        if(params.length > 2 && params[0].length > 0 && params[1].length > 0 && params[2].length > 0){
            var questionData = {
                userId : request.user.id
                ,link: params[0]
                ,lang1 : params[1]
                ,lang2 : params[2]
            }

            if(params.length > 3){
                questionData.status = params[3];
            }

            questionEngine.create(pg, questionData, function(err, data){
                request.reply(err ? err : data);
            });


        } else {
            request.reply('format : /link/lang1/lang2/*status');
        }

    }
}