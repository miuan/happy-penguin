var levelEngine = require(process.cwd() + '/engine/levels/levels.js')
    ,async = require('async');
var Passport = null;
var Travelelogue = null;
var pgClient = null;

module.exports = {
    /**
     *
     * @param server
     * @param Hapi
     */
    $init : function(server, Hapi){
        Travelelogue = server.plugins.travelogue;
        pgClient = server.pgClient;
    }
    // get Hapi Config
    ,$getConfig : function(){
        return {
            auth:'passport',
            get_get : {
                auth:false,
                params : '{params*}'
            }
        }
    },
    create_post: function(request){
        var dataContainer = request.payload;

        levelEngine.create(pgClient,dataContainer, function(err, created){
            response(request, err, created);
        });
    },update_post: function(request){
        var dataContainer = request.payload;

        var ret = function(err, created){
            response(request, err, created);
        };

        var updated = [];

        if(dataContainer.posx || dataContainer.posy){
            updated.push(function(icb){
                levelEngine.updatepos(pgClient,dataContainer, icb);
            });

        }

        if(dataContainer.name){
            updated.push(function(icb){
                levelEngine.updatename(pgClient,dataContainer, icb);
            });
        }

        if(dataContainer.info){
            updated.push(function(icb){
                levelEngine.updateinfo(pgClient,dataContainer, icb);
            });
        }

        // i know strange behave but i have not better idea now...
        if(updated.length>0){
            async.parallel(updated, function(err, updatedArray){
                var retData = null;
                if(updatedArray && updatedArray.length>0){
                    retData = {};
                    updatedArray.forEach(function(ud){
                        if(ud.posx) retData.posx = ud.posx;
                        if(ud.posy) retData.posy = ud.posy;
                        if(ud.name) retData.name = ud.name;
                        if(ud.info) retData.info = ud.info;
                        if(ud.id) retData.id = ud.id;
                    })
                }
                response(request, err, retData);
            })
        } else {
            response(request, 'update can be just posx,posy,name,info...');
        }

    },
    get_get: function(request){
        var data = request.params.params.split('/');
        var dataContainer = {
            id: data[0]
        };

        if(data.length > 1){
            dataContainer.lang = data[1];
        }


        if(request.query.fields){
            dataContainer.fields = request.query.fields.split(',') ;
        }

        levelEngine.get(pgClient, dataContainer, function(err, getData){
            response(request, err, getData);
        });
    }

}





function isBlank(str) {
    return (!str || /^\s*$/.test(str));
}

function response(request, err, data){
    if(err){
        request.reply({error:err, success:-1}).code(400);
    } else {
        request.reply({success:1,error:'',response:data});
    }
}