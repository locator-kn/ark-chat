declare var Promise;
export interface IRegister {
    (server:any, options:any, next:any): void;
    attributes?: any;
}

export default
class Chat {
    joi:any;
    boom:any;
    db:any;
    hoek:any;
    realtime:any;

    constructor() {
        this.register.attributes = {
            pkg: require('./../../package.json')
        };

        this.joi = require('joi');
        this.boom = require('boom');
        this.hoek = require('hoek');
    }

    register:IRegister = (server, options, next) => {
        server.bind(this);


        server.dependency(['ark-database', 'ark-realtime'], (server, continueRegister) => {

            this.db = server.plugins['ark-database'];
            this.realtime = server.plugins['ark-realtime'];
            continueRegister();

            this._register(server, options);
            next();
        });
    };

    private _register(server, options) {

        /**
         * get all conversations for currently logged in user
         */
        server.route({
            method: 'GET',
            path: '/my/conversations',
            config: {
                handler: (request, reply) => {
                    var userId = request.auth.credentials._id;
                    this.db.getConversationsByUserId(userId)
                        .then(conversations => {
                            if (conversations.length) {
                                conversations.forEach((con:any) => {
                                    if (con.user_1 === userId) {
                                        con.opponent = con.user_2;
                                    } else {
                                        con.opponent = con.user_1;
                                    }
                                    delete con.user_1;
                                    delete con.user_2;
                                });
                            }
                            return reply(conversations);
                        }).catch(reply);
                }
            }
        });

        server.route({
            method: 'GET',
            path: '/conversations/{conversationId}',
            config: {
                handler: (request, reply) => {
                    var conversationId = request.params.conversationId;
                    var userId = request.auth.credentials._id;

                    this.db.getConversationById(conversationId)
                        .then(conversation => {
                            // check if user is participating conversation
                            if (conversation.user_1 === userId || conversation.user_2 === userId) {
                                return reply(conversation);
                            } else {
                                return reply({message: 'you are not a fellow of this conversation'}).code(401);
                            }

                        }).catch(reply)
                },
                validate: {
                    params: {
                        conversationId: this.joi.string().required()
                    }
                }
            }
        });

        server.route({
            method: 'GET',
            path: '/messages/{conversationId}',
            config: {
                handler: (request, reply) => {
                    var conversationId = request.params.conversationId;
                    var userId = request.auth.credentials._id;

                    this.db.iAmPartOfThisConversation(userId, conversationId)
                        .then(value => {
                            return reply(this.db.getMessagesByConversionId(conversationId, request.query));
                        }).catch(reply);
                },
                description: 'Get all messages of a conversation',
                notes: 'getMessagesByConversionId',
                tags: ['chat', 'messages'],
                validate: {
                    params: {
                        conversationId: this.joi.string().required()
                    }
                    ,
                    query: this.joi.object().keys({
                        page: this.joi.number().integer(),
                        elements: this.joi.number().integer().positive()
                    }).and('page', 'elements')
                }

            }
        });

        server.route({
            method: 'POST',
            path: '/messages/{conversationId}',
            config: {
                handler: (request, reply) => {
                    var receiver = request.payload.to;

                    var messageObj = {
                        conversation_id: request.params.conversationId,
                        from: request.payload.from,
                        to: receiver,
                        message: request.payload.message,
                        timestamp: Date.now(),
                        type: 'message'
                    };

                    this.saveMessage(messageObj, receiver)
                        .then(() => {
                            return reply({message: 'message sent'});
                        }).catch(err => {
                            return reply(this.boom.badRequest(err));
                        });

                },
                description: 'Create a new message in a conversation',
                notes: 'This will also emit a websocket message to the user',
                tags: ['chat', 'messages', 'websockets'],
                validate: {
                    params: {
                        conversationId: this.joi.string().required()
                    },
                    payload: this.joi.object().keys({
                        from: this.joi.string().required(),
                        to: this.joi.string().required(),
                        message: this.joi.string().required()
                    }).required()
                }
            }
        });


        var newConversationSchema = this.joi.object().keys({
            user_id: this.joi.string().required(),
            message: this.joi.string().required(),
            trip: this.joi.string()
        }).required();

        server.route({
            method: 'POST',
            path: '/conversations',
            config: {
                handler: (request, reply) => {
                    var me = request.auth.credentials._id;
                    var opp = request.payload.user_id;
                    var tripId = request.payload.trip;
                    var conversation:any = {};
                    var conversationID:string;

                    if (me === opp) {
                        return reply(this.boom.badData('Wrong userid emmited'))
                    }

                    this.db.conversationDoesNotExist(me, opp)
                        .then(() => {

                            // create new conversation

                            conversation = {
                                user_1: me,
                                user_2: opp,
                                type: 'conversation'
                            };

                            // add trip to conversation, if omitted
                            if (tripId) {
                                conversation.trip = tripId;
                            }

                            conversation[me + '_read'] = true;
                            conversation[opp + '_read'] = false;

                            return this.db.createConversation(conversation);

                        }).catch(conversation => {

                            // conversation exists

                            if (conversation.isBoom) {
                                    return Promise.reject(conversation)
                            } else if (!tripId) {
                                    return Promise.reject(this.boom.conflict('Conversation already exists', conversation))
                            }

                            // update conversation with new trip, if trip is emitted
                            return this.db.updateConversation(conversation.id || conversation._id, {trip: tripId});

                        }).then((data:any) => {

                            // send/save the actual message

                            conversationID = data._id || data.id;

                            var messageObj = {
                                conversation_id: conversationID,
                                from: me,
                                to: opp,
                                message: request.payload.message,
                                timestamp: Date.now(),
                                type: 'message'
                            };
                            return this.saveMessage(messageObj, opp);

                        }).then((data:any) => {

                            // return conversations_id instead of messageID:
                            // https://github.com/locator-kn/ark/issues/24
                            data.id = conversationID;

                            return reply(data);

                        }).catch(reply);
                },
                description: 'Creates a new conversation with a user',
                notes: 'with_user needs to be a valid from a user',
                tags: ['api', 'chat', 'conversation'],
                validate: {
                    payload: newConversationSchema
                }
            }
        });


    }

    saveMessage = (messageObj, receiver) => {

        return new Promise((resolve, reject) => {

            this.db.saveMessage(messageObj, (err, data) => {

                if (err) {
                    return reject(err);
                }
                this.realtime.emitMessage(receiver, this.hoek.merge(messageObj, {opponent: messageObj.from}));
                return resolve(data);
            });
        })
    };

    sendMails = (sendUserID, receiveUserID, tripID, conversationID) => {

        var sendUser:any = {};
        var receiveUser:any = {};

        var userProm = this.db.getDocument(sendUserID);
        var opponentProm = this.db.getDocument(receiveUserID);
        var tripProm = this.db.getDocument(tripID);

        Promise.all([userProm, opponentProm, tripProm])
            .then((value:any)=> {
                sendUser.name = value[0].name;
                sendUser.picture = value[0].picture;

                receiveUser.name = value[1].name;

                var tripTitle = value[2].title;

                this.mailer.sendTripInterestMail(sendUser, receiveUser, tripTitle, conversationID);

            })
            .catch(err => console.error(err));


    };


    errorInit(error) {
        if (error) {
            console.log('Error: Failed to load plugin (Chat):', error);
        }
    }
}